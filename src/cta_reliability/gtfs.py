from __future__ import annotations

import csv
import hashlib
import ssl
import sqlite3
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

import certifi


REQUIRED_FILES = {
    "routes.txt",
    "trips.txt",
    "stops.txt",
    "stop_times.txt",
    "calendar.txt",
    "calendar_dates.txt",
}


class GTFSError(RuntimeError):
    """Raised when the CTA GTFS package is missing or malformed."""


def download_gtfs(url: str, destination: Path) -> str:
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = Request(url, headers={"User-Agent": "cta-transit-reliability/0.1"})
    context = ssl.create_default_context(cafile=certifi.where())
    digest = hashlib.sha256()

    with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as temp_file:
        temp_path = Path(temp_file.name)
        try:
            with urlopen(request, timeout=120, context=context) as response:
                while chunk := response.read(1024 * 1024):
                    temp_file.write(chunk)
                    digest.update(chunk)
            validate_archive(temp_path)
            temp_path.replace(destination)
        except Exception:
            temp_path.unlink(missing_ok=True)
            raise
    return digest.hexdigest()


def validate_archive(path: Path) -> None:
    if not zipfile.is_zipfile(path):
        raise GTFSError("Downloaded file is not a valid ZIP archive")
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
    missing = REQUIRED_FILES - names
    if missing:
        raise GTFSError(f"GTFS archive is missing: {', '.join(sorted(missing))}")


def _records(archive: zipfile.ZipFile, filename: str):
    with archive.open(filename) as binary_file:
        import io

        with io.TextIOWrapper(binary_file, encoding="utf-8-sig", newline="") as text_file:
            yield from csv.DictReader(text_file)


def load_rail_gtfs(
    connection: sqlite3.Connection, archive_path: Path, source_url: str, sha256: str
) -> dict[str, int]:
    validate_archive(archive_path)
    imported_at = datetime.now(timezone.utc).isoformat()

    with zipfile.ZipFile(archive_path) as archive:
        routes = [row for row in _records(archive, "routes.txt") if row["route_type"] == "1"]
        route_ids = {row["route_id"] for row in routes}
        trips = [row for row in _records(archive, "trips.txt") if row["route_id"] in route_ids]
        trip_ids = {row["trip_id"] for row in trips}
        service_ids = {row["service_id"] for row in trips}

        stop_times = []
        used_stop_ids = set()
        for row in _records(archive, "stop_times.txt"):
            if row["trip_id"] not in trip_ids:
                continue
            stop_times.append(row)
            used_stop_ids.add(row["stop_id"])

        all_stops = list(_records(archive, "stops.txt"))
        parent_ids = {
            row.get("parent_station", "") for row in all_stops if row["stop_id"] in used_stop_ids
        } - {""}
        stops = [
            row for row in all_stops if row["stop_id"] in used_stop_ids or row["stop_id"] in parent_ids
        ]
        calendars = [
            row for row in _records(archive, "calendar.txt") if row["service_id"] in service_ids
        ]
        calendar_dates = [
            row
            for row in _records(archive, "calendar_dates.txt")
            if row["service_id"] in service_ids
        ]

    with connection:
        for table in (
            "gtfs_stop_times",
            "gtfs_trips",
            "gtfs_stops",
            "gtfs_routes",
            "gtfs_calendar",
            "gtfs_calendar_dates",
            "gtfs_feed_metadata",
        ):
            connection.execute(f"DELETE FROM {table}")

        connection.executemany(
            "INSERT INTO gtfs_routes VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    r["route_id"], r.get("agency_id"), r.get("route_short_name"),
                    r.get("route_long_name"), int(r["route_type"]), r.get("route_color"),
                    r.get("route_text_color"),
                )
                for r in routes
            ],
        )
        connection.executemany(
            "INSERT INTO gtfs_stops VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    r["stop_id"], r.get("stop_code"), r["stop_name"],
                    float(r["stop_lat"]), float(r["stop_lon"]),
                    int(r.get("location_type") or 0), r.get("parent_station") or None,
                )
                for r in stops
            ],
        )
        connection.executemany(
            "INSERT INTO gtfs_trips VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    r["trip_id"], r["route_id"], r["service_id"], r.get("trip_headsign"),
                    r.get("direction_id") or None, r.get("block_id") or None,
                    r.get("shape_id") or None,
                )
                for r in trips
            ],
        )
        connection.executemany(
            "INSERT INTO gtfs_stop_times VALUES (?, ?, ?, ?, ?, ?)",
            [
                (
                    r["trip_id"], r["arrival_time"], r["departure_time"], r["stop_id"],
                    int(r["stop_sequence"]), r.get("shape_dist_traveled") or None,
                )
                for r in stop_times
            ],
        )
        connection.executemany(
            "INSERT INTO gtfs_calendar VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    r["service_id"], int(r["monday"]), int(r["tuesday"]),
                    int(r["wednesday"]), int(r["thursday"]), int(r["friday"]),
                    int(r["saturday"]), int(r["sunday"]), r["start_date"], r["end_date"],
                )
                for r in calendars
            ],
        )
        connection.executemany(
            "INSERT INTO gtfs_calendar_dates VALUES (?, ?, ?)",
            [(r["service_id"], r["date"], int(r["exception_type"])) for r in calendar_dates],
        )
        connection.execute(
            "INSERT INTO gtfs_feed_metadata VALUES (?, ?, ?)",
            (source_url, sha256, imported_at),
        )

    return {
        "routes": len(routes),
        "stops": len(stops),
        "trips": len(trips),
        "stop_times": len(stop_times),
        "calendar": len(calendars),
        "calendar_dates": len(calendar_dates),
    }
