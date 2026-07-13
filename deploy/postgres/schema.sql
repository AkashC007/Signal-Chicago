CREATE TABLE IF NOT EXISTS daily_ridership (
    service_date DATE PRIMARY KEY,
    day_type CHAR(1) NOT NULL CHECK (day_type IN ('W', 'A', 'U')),
    bus_rides INTEGER NOT NULL CHECK (bus_rides >= 0),
    rail_rides INTEGER NOT NULL CHECK (rail_rides >= 0),
    total_rides INTEGER NOT NULL CHECK (total_rides >= 0),
    source_updated_at TIMESTAMPTZ NOT NULL,
    CHECK (bus_rides + rail_rides = total_rides)
);

CREATE TABLE IF NOT EXISTS train_arrival_predictions (
    snapshot_at TIMESTAMPTZ NOT NULL,
    station_id INTEGER NOT NULL,
    stop_id INTEGER NOT NULL,
    station_name TEXT NOT NULL,
    platform_description TEXT NOT NULL,
    run_number TEXT NOT NULL,
    route_code TEXT NOT NULL,
    destination_name TEXT NOT NULL,
    prediction_generated_at TIMESTAMPTZ NOT NULL,
    predicted_arrival_at TIMESTAMPTZ NOT NULL,
    seconds_to_arrival INTEGER NOT NULL CHECK (seconds_to_arrival >= 0),
    is_approaching BOOLEAN NOT NULL,
    is_scheduled BOOLEAN NOT NULL,
    is_delayed BOOLEAN NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    heading INTEGER,
    source_updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (snapshot_at, run_number, stop_id, predicted_arrival_at)
);

CREATE TABLE IF NOT EXISTS collection_runs (
    run_id UUID PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    stations_requested INTEGER NOT NULL,
    stations_succeeded INTEGER NOT NULL,
    stations_failed INTEGER NOT NULL,
    predictions_loaded INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'completed_with_errors'))
);

CREATE TABLE IF NOT EXISTS collection_errors (
    run_id UUID NOT NULL REFERENCES collection_runs(run_id),
    station_id INTEGER NOT NULL,
    error_message TEXT NOT NULL,
    PRIMARY KEY (run_id, station_id)
);

CREATE INDEX IF NOT EXISTS idx_prediction_station_run_time
    ON train_arrival_predictions (station_id, run_number, snapshot_at);
CREATE INDEX IF NOT EXISTS idx_prediction_route_time
    ON train_arrival_predictions (route_code, snapshot_at DESC);

CREATE OR REPLACE VIEW vw_eta_revisions AS
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
    EXTRACT(EPOCH FROM (predicted_arrival_at - previous_predicted_arrival_at)) / 60.0
        AS eta_revision_minutes
FROM sequenced;

CREATE OR REPLACE VIEW vw_data_freshness AS
SELECT
    MAX(snapshot_at) AS latest_prediction_at,
    EXTRACT(EPOCH FROM (NOW() - MAX(snapshot_at))) / 60.0 AS age_minutes,
    CASE
        WHEN MAX(snapshot_at) IS NULL THEN 'missing'
        WHEN NOW() - MAX(snapshot_at) <= INTERVAL '5 minutes' THEN 'fresh'
        WHEN NOW() - MAX(snapshot_at) <= INTERVAL '15 minutes' THEN 'delayed'
        ELSE 'stale'
    END AS freshness_status
FROM train_arrival_predictions;

