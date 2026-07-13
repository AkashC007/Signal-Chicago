from __future__ import annotations

import json
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from cta_reliability.train_tracker import TrainTrackerError, fetch_arrivals, transform_arrivals
from cta_reliability.warehouse import insert_arrival_predictions


def rail_parent_stations(connection: sqlite3.Connection, limit: int) -> list[int]:
    rows = connection.execute(
        """
        SELECT CAST(stop_id AS INTEGER)
        FROM gtfs_stops
        WHERE location_type = 1
          AND CAST(stop_id AS INTEGER) BETWEEN 40000 AND 49999
        ORDER BY stop_name, stop_id
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    if not rows:
        raise RuntimeError("No GTFS rail stations found. Run ingest-gtfs first.")
    return [row[0] for row in rows]


def load_station_cohort(path: Path) -> list[int]:
    payload = json.loads(path.read_text())
    stations = payload.get("stations")
    if not isinstance(stations, list) or not stations:
        raise ValueError("Station configuration must contain a non-empty stations list")
    station_ids = [int(station["station_id"]) for station in stations]
    if len(station_ids) != len(set(station_ids)):
        raise ValueError("Station configuration contains duplicate station IDs")
    if len(station_ids) > 50:
        raise ValueError("Station cohort cannot contain more than 50 stations")
    return station_ids


def validate_station_cohort(connection: sqlite3.Connection, station_ids: list[int]) -> None:
    placeholders = ",".join("?" for _ in station_ids)
    rows = connection.execute(
        f"""
        SELECT CAST(stop_id AS INTEGER)
        FROM gtfs_stops
        WHERE location_type = 1 AND CAST(stop_id AS INTEGER) IN ({placeholders})
        """,
        station_ids,
    ).fetchall()
    found = {row[0] for row in rows}
    missing = sorted(set(station_ids) - found)
    if missing:
        raise ValueError(f"Configured station IDs are missing from GTFS: {missing}")


def collect_network_snapshot(
    connection: sqlite3.Connection,
    station_limit: int = 10,
    max_results: int = 5,
    station_ids: list[int] | None = None,
) -> dict[str, int | str]:
    if not 1 <= station_limit <= 50:
        raise ValueError("station_limit must be between 1 and 50")
    if not 1 <= max_results <= 20:
        raise ValueError("max_results must be between 1 and 20")

    if station_ids is None:
        station_ids = rail_parent_stations(connection, station_limit)
    else:
        station_ids = station_ids[:station_limit]
        validate_station_cohort(connection, station_ids)
    run_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc).isoformat()
    connection.execute(
        """
        INSERT INTO collection_runs (
            run_id, started_at, stations_requested, stations_succeeded,
            stations_failed, predictions_loaded, status
        ) VALUES (?, ?, ?, 0, 0, 0, 'running')
        """,
        (run_id, started_at, len(station_ids)),
    )
    connection.commit()

    succeeded = failed = predictions = 0
    for station_id in station_ids:
        try:
            root = fetch_arrivals(station_id, max_results=max_results)
            rows = transform_arrivals(root)
            predictions += insert_arrival_predictions(connection, rows)
            succeeded += 1
        except (TrainTrackerError, KeyError, TypeError, ValueError) as exc:
            failed += 1
            connection.execute(
                "INSERT INTO collection_errors VALUES (?, ?, ?)",
                (run_id, station_id, str(exc)[:300]),
            )
            connection.commit()

    completed_at = datetime.now(timezone.utc).isoformat()
    status = "completed" if failed == 0 else "completed_with_errors"
    connection.execute(
        """
        UPDATE collection_runs
        SET completed_at = ?, stations_succeeded = ?, stations_failed = ?,
            predictions_loaded = ?, status = ?
        WHERE run_id = ?
        """,
        (completed_at, succeeded, failed, predictions, status, run_id),
    )
    connection.commit()
    return {
        "run_id": run_id,
        "stations_requested": len(station_ids),
        "stations_succeeded": succeeded,
        "stations_failed": failed,
        "predictions_loaded": predictions,
    }


def collect_recurring(
    connection_factory,
    station_ids: list[int],
    interval_seconds: int = 120,
    max_results: int = 5,
    runs: int | None = None,
) -> list[dict[str, int | str]]:
    if interval_seconds < 60:
        raise ValueError("Recurring collection interval cannot be less than 60 seconds")
    completed_runs = []
    while runs is None or len(completed_runs) < runs:
        started = time.monotonic()
        with connection_factory() as connection:
            completed_runs.append(
                collect_network_snapshot(
                    connection,
                    station_limit=len(station_ids),
                    max_results=max_results,
                    station_ids=station_ids,
                )
            )
        if runs is not None and len(completed_runs) >= runs:
            break
        elapsed = time.monotonic() - started
        time.sleep(max(0, interval_seconds - elapsed))
    return completed_runs
