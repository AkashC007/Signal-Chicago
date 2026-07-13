from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Iterable


SCHEMA = """
CREATE TABLE IF NOT EXISTS daily_ridership (
    service_date TEXT PRIMARY KEY,
    day_type TEXT NOT NULL CHECK (day_type IN ('W', 'A', 'U')),
    bus_rides INTEGER NOT NULL CHECK (bus_rides >= 0),
    rail_rides INTEGER NOT NULL CHECK (rail_rides >= 0),
    total_rides INTEGER NOT NULL CHECK (total_rides >= 0),
    source_updated_at TEXT NOT NULL,
    CHECK (bus_rides + rail_rides = total_rides)
);

CREATE TABLE IF NOT EXISTS train_arrival_predictions (
    snapshot_at TEXT NOT NULL,
    station_id INTEGER NOT NULL,
    stop_id INTEGER NOT NULL,
    station_name TEXT NOT NULL,
    platform_description TEXT NOT NULL,
    run_number TEXT NOT NULL,
    route_code TEXT NOT NULL,
    destination_name TEXT NOT NULL,
    prediction_generated_at TEXT NOT NULL,
    predicted_arrival_at TEXT NOT NULL,
    seconds_to_arrival INTEGER NOT NULL CHECK (seconds_to_arrival >= 0),
    is_approaching INTEGER NOT NULL CHECK (is_approaching IN (0, 1)),
    is_scheduled INTEGER NOT NULL CHECK (is_scheduled IN (0, 1)),
    is_delayed INTEGER NOT NULL CHECK (is_delayed IN (0, 1)),
    latitude REAL,
    longitude REAL,
    heading INTEGER,
    source_updated_at TEXT NOT NULL,
    PRIMARY KEY (snapshot_at, run_number, stop_id, predicted_arrival_at)
);

CREATE TABLE IF NOT EXISTS gtfs_routes (
    route_id TEXT PRIMARY KEY, agency_id TEXT, route_short_name TEXT,
    route_long_name TEXT, route_type INTEGER NOT NULL, route_color TEXT,
    route_text_color TEXT
);
CREATE TABLE IF NOT EXISTS gtfs_stops (
    stop_id TEXT PRIMARY KEY, stop_code TEXT, stop_name TEXT NOT NULL,
    stop_lat REAL NOT NULL, stop_lon REAL NOT NULL, location_type INTEGER NOT NULL,
    parent_station TEXT
);
CREATE TABLE IF NOT EXISTS gtfs_trips (
    trip_id TEXT PRIMARY KEY, route_id TEXT NOT NULL, service_id TEXT NOT NULL,
    trip_headsign TEXT, direction_id TEXT, block_id TEXT, shape_id TEXT,
    FOREIGN KEY (route_id) REFERENCES gtfs_routes(route_id)
);
CREATE TABLE IF NOT EXISTS gtfs_stop_times (
    trip_id TEXT NOT NULL, arrival_time TEXT NOT NULL, departure_time TEXT NOT NULL,
    stop_id TEXT NOT NULL, stop_sequence INTEGER NOT NULL, shape_dist_traveled TEXT,
    PRIMARY KEY (trip_id, stop_sequence),
    FOREIGN KEY (trip_id) REFERENCES gtfs_trips(trip_id),
    FOREIGN KEY (stop_id) REFERENCES gtfs_stops(stop_id)
);
CREATE TABLE IF NOT EXISTS gtfs_calendar (
    service_id TEXT PRIMARY KEY, monday INTEGER, tuesday INTEGER, wednesday INTEGER,
    thursday INTEGER, friday INTEGER, saturday INTEGER, sunday INTEGER,
    start_date TEXT NOT NULL, end_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gtfs_calendar_dates (
    service_id TEXT NOT NULL, service_date TEXT NOT NULL, exception_type INTEGER NOT NULL,
    PRIMARY KEY (service_id, service_date)
);
CREATE TABLE IF NOT EXISTS gtfs_feed_metadata (
    source_url TEXT NOT NULL, sha256 TEXT NOT NULL, imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_runs (
    run_id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    stations_requested INTEGER NOT NULL,
    stations_succeeded INTEGER NOT NULL,
    stations_failed INTEGER NOT NULL,
    predictions_loaded INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'completed_with_errors'))
);
CREATE TABLE IF NOT EXISTS collection_errors (
    run_id TEXT NOT NULL,
    station_id INTEGER NOT NULL,
    error_message TEXT NOT NULL,
    PRIMARY KEY (run_id, station_id),
    FOREIGN KEY (run_id) REFERENCES collection_runs(run_id)
);

CREATE INDEX IF NOT EXISTS idx_gtfs_stop_times_stop ON gtfs_stop_times(stop_id);
CREATE INDEX IF NOT EXISTS idx_gtfs_trips_route ON gtfs_trips(route_id);

CREATE VIEW IF NOT EXISTS vw_latest_arrival_predictions AS
SELECT prediction.*
FROM train_arrival_predictions AS prediction
JOIN (
    SELECT station_id, MAX(snapshot_at) AS latest_snapshot_at
    FROM train_arrival_predictions
    GROUP BY station_id
) AS latest
  ON prediction.station_id = latest.station_id
 AND prediction.snapshot_at = latest.latest_snapshot_at;

CREATE VIEW IF NOT EXISTS vw_route_snapshot_metrics AS
SELECT
    route_code,
    COUNT(*) AS predictions,
    COUNT(DISTINCT station_id) AS stations_observed,
    ROUND(AVG(seconds_to_arrival) / 60.0, 2) AS avg_expected_wait_minutes,
    ROUND(100.0 * AVG(is_delayed), 2) AS delayed_prediction_pct,
    ROUND(100.0 * AVG(is_scheduled), 2) AS scheduled_prediction_pct,
    ROUND(100.0 * AVG(is_approaching), 2) AS approaching_prediction_pct,
    MAX(snapshot_at) AS latest_snapshot_at
FROM vw_latest_arrival_predictions
GROUP BY route_code;

CREATE VIEW IF NOT EXISTS vw_station_snapshot_metrics AS
SELECT
    route_code,
    station_id,
    station_name,
    COUNT(*) AS predictions,
    ROUND(AVG(seconds_to_arrival) / 60.0, 2) AS avg_expected_wait_minutes,
    ROUND(100.0 * AVG(is_delayed), 2) AS delayed_prediction_pct,
    ROUND(100.0 * AVG(is_scheduled), 2) AS scheduled_prediction_pct,
    MAX(snapshot_at) AS latest_snapshot_at
FROM vw_latest_arrival_predictions
GROUP BY route_code, station_id, station_name;

CREATE VIEW IF NOT EXISTS vw_data_freshness AS
SELECT
    MAX(snapshot_at) AS latest_prediction_at,
    CAST((julianday('now') - julianday(MAX(snapshot_at))) * 24 * 60 AS INTEGER)
        AS age_minutes,
    CASE
        WHEN MAX(snapshot_at) IS NULL THEN 'missing'
        WHEN (julianday('now') - julianday(MAX(snapshot_at))) * 24 * 60 <= 5 THEN 'fresh'
        WHEN (julianday('now') - julianday(MAX(snapshot_at))) * 24 * 60 <= 15 THEN 'delayed'
        ELSE 'stale'
    END AS freshness_status
FROM train_arrival_predictions;

CREATE VIEW IF NOT EXISTS vw_eta_revisions AS
WITH sequenced AS (
    SELECT
        prediction.*,
        LAG(predicted_arrival_at) OVER (
            PARTITION BY station_id, stop_id, run_number
            ORDER BY snapshot_at
        ) AS previous_predicted_arrival_at
    FROM train_arrival_predictions AS prediction
)
SELECT
    sequenced.*,
    CASE
        WHEN previous_predicted_arrival_at IS NULL THEN NULL
        ELSE ROUND(
            (julianday(predicted_arrival_at) - julianday(previous_predicted_arrival_at))
            * 24 * 60,
            2
        )
    END AS eta_revision_minutes
FROM sequenced;

CREATE VIEW IF NOT EXISTS vw_prediction_stability_components AS
SELECT
    route_code,
    station_id,
    station_name,
    run_number,
    COUNT(*) AS observation_count,
    COUNT(eta_revision_minutes) AS revision_count,
    ROUND(AVG(ABS(eta_revision_minutes)), 2) AS avg_absolute_revision_minutes,
    ROUND(MAX(ABS(eta_revision_minutes)), 2) AS largest_absolute_revision_minutes,
    MIN(snapshot_at) AS first_observed_at,
    MAX(snapshot_at) AS last_observed_at
FROM vw_eta_revisions
GROUP BY route_code, station_id, station_name, run_number;
"""


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    connection.executescript(SCHEMA)
    return connection


def upsert_ridership(connection: sqlite3.Connection, rows: Iterable[tuple]) -> int:
    materialized = list(rows)
    connection.executemany(
        """
        INSERT INTO daily_ridership (
            service_date, day_type, bus_rides, rail_rides, total_rides, source_updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(service_date) DO UPDATE SET
            day_type = excluded.day_type,
            bus_rides = excluded.bus_rides,
            rail_rides = excluded.rail_rides,
            total_rides = excluded.total_rides,
            source_updated_at = excluded.source_updated_at
        """,
        materialized,
    )
    connection.commit()
    return len(materialized)


def insert_arrival_predictions(connection: sqlite3.Connection, rows: Iterable[tuple]) -> int:
    materialized = list(rows)
    connection.executemany(
        """
        INSERT OR IGNORE INTO train_arrival_predictions (
            snapshot_at, station_id, stop_id, station_name, platform_description,
            run_number, route_code, destination_name, prediction_generated_at,
            predicted_arrival_at, seconds_to_arrival, is_approaching, is_scheduled,
            is_delayed, latitude, longitude, heading, source_updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        materialized,
    )
    connection.commit()
    return len(materialized)
