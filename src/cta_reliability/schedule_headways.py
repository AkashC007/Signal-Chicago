from __future__ import annotations

import json
import os
import ssl
import sqlite3
from collections import defaultdict
from statistics import median
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import certifi


PERIODS = (
    ("overnight", 0, 360),
    ("am_peak", 360, 540),
    ("midday", 540, 900),
    ("pm_peak", 900, 1140),
    ("evening", 1140, 1440),
)


class ScheduleSyncError(RuntimeError):
    """Raised when scheduled headways cannot be calculated or uploaded."""


def _arrival_minute(value: str) -> int:
    parts = value.split(":")
    if len(parts) != 3:
        raise ScheduleSyncError(f"Invalid GTFS arrival time: {value}")
    hour, minute, second = (int(part) for part in parts)
    if minute > 59 or second > 59 or hour < 0:
        raise ScheduleSyncError(f"Invalid GTFS arrival time: {value}")
    return (hour * 60 + minute) % 1440


def _period(minute: int) -> tuple[str, int, int]:
    for name, start, end in PERIODS:
        if start <= minute < end:
            return name, start, end
    raise ScheduleSyncError(f"Arrival minute outside service day: {minute}")


def _service_types(row: sqlite3.Row) -> Iterable[str]:
    if any(row[name] for name in ("monday", "tuesday", "wednesday", "thursday", "friday")):
        yield "weekday"
    if row["saturday"]:
        yield "saturday"
    if row["sunday"]:
        yield "sunday_holiday"


def compute_scheduled_headways(
    connection: sqlite3.Connection, station_ids: list[int]
) -> list[dict[str, object]]:
    if not station_ids:
        raise ScheduleSyncError("Station cohort is empty")
    connection.row_factory = sqlite3.Row
    placeholders = ",".join("?" for _ in station_ids)
    events: dict[tuple[str, int, str, str, str], set[int]] = defaultdict(set)

    rows = connection.execute(
        f"""
        SELECT
            trip.route_id,
            CAST(parent.stop_id AS INTEGER) AS station_id,
            COALESCE(trip.direction_id, child.stop_id) AS direction_key,
            stop_time.arrival_time,
            calendar.monday,
            calendar.tuesday,
            calendar.wednesday,
            calendar.thursday,
            calendar.friday,
            calendar.saturday,
            calendar.sunday
        FROM gtfs_stop_times AS stop_time
        JOIN gtfs_trips AS trip ON trip.trip_id = stop_time.trip_id
        JOIN gtfs_stops AS child ON child.stop_id = stop_time.stop_id
        JOIN gtfs_stops AS parent ON parent.stop_id = child.parent_station
        JOIN gtfs_calendar AS calendar ON calendar.service_id = trip.service_id
        WHERE CAST(parent.stop_id AS INTEGER) IN ({placeholders})
        """,
        station_ids,
    )

    for row in rows:
        minute = _arrival_minute(row["arrival_time"])
        period_name, _, _ = _period(minute)
        for service_type in _service_types(row):
            events[
                (
                    row["route_id"],
                    row["station_id"],
                    service_type,
                    period_name,
                    str(row["direction_key"]),
                )
            ].add(minute)

    grouped_gaps: dict[tuple[str, int, str, str], list[int]] = defaultdict(list)
    grouped_trip_counts: dict[tuple[str, int, str, str], int] = defaultdict(int)
    for (route, station, service_type, period_name, _), minutes in events.items():
        ordered = sorted(minutes)
        gaps = [later - earlier for earlier, later in zip(ordered, ordered[1:])]
        valid_gaps = [gap for gap in gaps if 1 <= gap <= 60]
        if not valid_gaps:
            continue
        key = (route, station, service_type, period_name)
        grouped_gaps[key].extend(valid_gaps)
        grouped_trip_counts[key] += len(ordered)

    metadata = connection.execute(
        "SELECT MAX(imported_at) AS imported_at FROM gtfs_feed_metadata"
    ).fetchone()
    imported_at = metadata["imported_at"] if metadata else None
    if not imported_at:
        raise ScheduleSyncError("GTFS feed metadata is missing")

    period_lookup = {name: (start, end) for name, start, end in PERIODS}
    output = []
    for key in sorted(grouped_gaps):
        route, station, service_type, period_name = key
        start, end = period_lookup[period_name]
        output.append(
            {
                "route_code": route,
                "station_id": station,
                "service_type": service_type,
                "period_name": period_name,
                "period_start": f"{start // 60:02d}:{start % 60:02d}:00",
                "period_end": "23:59:59" if end == 1440 else f"{end // 60:02d}:{end % 60:02d}:00",
                "scheduled_headway_minutes": round(float(median(grouped_gaps[key])), 2),
                "trips_sampled": grouped_trip_counts[key],
                "feed_imported_at": imported_at,
            }
        )
    if not output:
        raise ScheduleSyncError("No scheduled headways were calculated")
    return output


def upload_scheduled_headways(rows: list[dict[str, object]]) -> int:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise ScheduleSyncError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    request = Request(
        f"{url}/rest/v1/rpc/replace_scheduled_headways",
        data=json.dumps({"p_rows": rows}).encode("utf-8"),
        headers={
            "apikey": key,
            "authorization": f"Bearer {key}",
            "content-type": "application/json",
            "user-agent": "signal-chicago-schedule-sync/1.0",
        },
        method="POST",
    )
    context = ssl.create_default_context(cafile=certifi.where())
    try:
        with urlopen(request, timeout=60, context=context) as response:
            result = json.load(response)
    except (HTTPError, URLError, TimeoutError) as exc:
        raise ScheduleSyncError(f"Supabase schedule upload failed ({type(exc).__name__})") from None
    return int(result)
