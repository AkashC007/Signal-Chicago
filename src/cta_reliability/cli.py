from __future__ import annotations

import argparse

from cta_reliability.analytics import export_snapshot_metrics
from cta_reliability.collector import (
    collect_network_snapshot,
    collect_recurring,
    load_station_cohort,
)
from cta_reliability.config import Settings, load_project_env
from cta_reliability.gtfs import download_gtfs, load_rail_gtfs
from cta_reliability.ridership import fetch_ridership, transform_record
from cta_reliability.schedule_headways import compute_scheduled_headways, upload_scheduled_headways
from cta_reliability.train_tracker import fetch_arrivals, transform_arrivals
from cta_reliability.warehouse import (
    connect,
    insert_arrival_predictions,
    upsert_ridership,
)


def ingest_ridership(limit: int | None) -> None:
    settings = Settings.default()
    source_records = fetch_ridership(settings.ridership_url, limit=limit)
    rows = [transform_record(record) for record in source_records]
    with connect(settings.warehouse_path) as connection:
        loaded = upsert_ridership(connection, rows)
    print(f"Loaded {loaded:,} rows into {settings.warehouse_path}")


def ingest_train_arrivals(station_id: int, max_results: int) -> None:
    settings = Settings.default()
    load_project_env(settings.project_root)
    root = fetch_arrivals(station_id, max_results=max_results)
    rows = transform_arrivals(root)
    with connect(settings.warehouse_path) as connection:
        loaded = insert_arrival_predictions(connection, rows)
    print(f"Loaded {loaded:,} live predictions for station {station_id}")


def ingest_gtfs() -> None:
    settings = Settings.default()
    archive_path = settings.gtfs_archive_path
    if archive_path is None:
        raise RuntimeError("GTFS archive path is not configured")
    print("Downloading current CTA GTFS feed...")
    sha256 = download_gtfs(settings.gtfs_url, archive_path)
    with connect(settings.warehouse_path) as connection:
        counts = load_rail_gtfs(connection, archive_path, settings.gtfs_url, sha256)
    print("Loaded CTA rail schedule:")
    for name, count in counts.items():
        print(f"  {name}: {count:,}")


def collect_snapshot(station_limit: int, max_results: int) -> None:
    settings = Settings.default()
    load_project_env(settings.project_root)
    if settings.station_config_path is None:
        raise RuntimeError("Station cohort path is not configured")
    station_ids = load_station_cohort(settings.station_config_path)
    with connect(settings.warehouse_path) as connection:
        result = collect_network_snapshot(
            connection, station_limit, max_results, station_ids=station_ids
        )
    print(f"Collection run: {result['run_id']}")
    print(f"Stations succeeded: {result['stations_succeeded']}/{result['stations_requested']}")
    print(f"Predictions loaded: {result['predictions_loaded']}")
    print(f"Stations failed: {result['stations_failed']}")


def collect_two_minute_runs(runs: int | None, max_results: int) -> None:
    settings = Settings.default()
    load_project_env(settings.project_root)
    if settings.station_config_path is None:
        raise RuntimeError("Station cohort path is not configured")
    station_ids = load_station_cohort(settings.station_config_path)
    results = collect_recurring(
        lambda: connect(settings.warehouse_path),
        station_ids,
        interval_seconds=120,
        max_results=max_results,
        runs=runs,
    )
    for result in results:
        print(
            f"{result['run_id']}: {result['stations_succeeded']}/"
            f"{result['stations_requested']} stations, "
            f"{result['predictions_loaded']} predictions"
        )


def export_metrics() -> None:
    settings = Settings.default()
    with connect(settings.warehouse_path) as connection:
        paths = export_snapshot_metrics(connection, settings.project_root / "data" / "processed")
    for path in paths:
        print(f"Exported {path}")


def sync_scheduled_headways() -> None:
    settings = Settings.default()
    load_project_env(settings.project_root)
    if settings.station_config_path is None:
        raise RuntimeError("Station cohort path is not configured")
    station_ids = load_station_cohort(settings.station_config_path)
    with connect(settings.warehouse_path) as connection:
        rows = compute_scheduled_headways(connection, station_ids)
    uploaded = upload_scheduled_headways(rows)
    print(f"Uploaded {uploaded:,} scheduled headway summaries to Supabase")


def summarize() -> None:
    settings = Settings.default()
    with connect(settings.warehouse_path) as connection:
        row = connection.execute(
            """
            SELECT MIN(service_date), MAX(service_date), COUNT(*),
                   SUM(bus_rides), SUM(rail_rides), SUM(total_rides)
            FROM daily_ridership
            """
        ).fetchone()
    if row[2] == 0:
        print("Warehouse is empty. Run ingest-ridership first.")
        return
    print(f"Coverage: {row[0]} to {row[1]}")
    print(f"Days: {row[2]:,}")
    print(f"Bus rides: {row[3]:,}")
    print(f"Rail rides: {row[4]:,}")
    print(f"Total rides: {row[5]:,}")


def main() -> None:
    parser = argparse.ArgumentParser(description="CTA reliability data pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)
    ingest_parser = subparsers.add_parser("ingest-ridership")
    ingest_parser.add_argument("--limit", type=int, default=None)
    train_parser = subparsers.add_parser("ingest-train-arrivals")
    train_parser.add_argument("--station-id", type=int, default=40380)
    train_parser.add_argument("--max-results", type=int, default=10)
    subparsers.add_parser("ingest-gtfs")
    collect_parser = subparsers.add_parser("collect-network-snapshot")
    collect_parser.add_argument("--station-limit", type=int, default=12)
    collect_parser.add_argument("--max-results", type=int, default=5)
    recurring_parser = subparsers.add_parser("collect-recurring")
    recurring_parser.add_argument("--runs", type=int, default=None)
    recurring_parser.add_argument("--max-results", type=int, default=5)
    subparsers.add_parser("export-metrics")
    subparsers.add_parser("sync-scheduled-headways")
    subparsers.add_parser("summarize")
    args = parser.parse_args()

    if args.command == "ingest-ridership":
        ingest_ridership(args.limit)
    elif args.command == "ingest-train-arrivals":
        ingest_train_arrivals(args.station_id, args.max_results)
    elif args.command == "ingest-gtfs":
        ingest_gtfs()
    elif args.command == "collect-network-snapshot":
        collect_snapshot(args.station_limit, args.max_results)
    elif args.command == "collect-recurring":
        collect_two_minute_runs(args.runs, args.max_results)
    elif args.command == "export-metrics":
        export_metrics()
    elif args.command == "sync-scheduled-headways":
        sync_scheduled_headways()
    elif args.command == "summarize":
        summarize()


if __name__ == "__main__":
    main()
