import sqlite3
import tempfile
import unittest
from pathlib import Path

from cta_reliability.collector import load_station_cohort, rail_parent_stations
from cta_reliability.warehouse import SCHEMA


class CollectorTests(unittest.TestCase):
    def test_selects_only_parent_station_ids(self):
        connection = sqlite3.connect(":memory:")
        connection.executescript(SCHEMA)
        connection.executemany(
            "INSERT INTO gtfs_stops VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                ("40380", None, "Clark/Lake", 41.0, -87.0, 1, None),
                ("30074", None, "Clark/Lake platform", 41.0, -87.0, 0, "40380"),
            ],
        )
        self.assertEqual(rail_parent_stations(connection, 10), [40380])

    def test_rejects_missing_gtfs_stations(self):
        connection = sqlite3.connect(":memory:")
        connection.executescript(SCHEMA)
        with self.assertRaises(RuntimeError):
            rail_parent_stations(connection, 10)

    def test_loads_versioned_station_cohort(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "stations.json"
            path.write_text('{"stations":[{"station_id":40380},{"station_id":41400}]}')
            self.assertEqual(load_station_cohort(path), [40380, 41400])

    def test_rejects_duplicate_station_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "stations.json"
            path.write_text('{"stations":[{"station_id":40380},{"station_id":40380}]}')
            with self.assertRaises(ValueError):
                load_station_cohort(path)


if __name__ == "__main__":
    unittest.main()
