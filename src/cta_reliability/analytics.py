from __future__ import annotations

import csv
import sqlite3
from pathlib import Path


def export_snapshot_metrics(connection: sqlite3.Connection, output_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    exports = {
        "route_snapshot_metrics.csv": "SELECT * FROM vw_route_snapshot_metrics ORDER BY route_code",
        "station_snapshot_metrics.csv": (
            "SELECT * FROM vw_station_snapshot_metrics ORDER BY route_code, station_name"
        ),
    }
    paths = []
    for filename, query in exports.items():
        cursor = connection.execute(query)
        path = output_dir / filename
        with path.open("w", encoding="utf-8", newline="") as file:
            writer = csv.writer(file)
            writer.writerow([column[0] for column in cursor.description])
            writer.writerows(cursor.fetchall())
        paths.append(path)
    return paths

