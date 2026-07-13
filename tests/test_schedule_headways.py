import sqlite3
import unittest

from cta_reliability.schedule_headways import compute_scheduled_headways
from cta_reliability.warehouse import SCHEMA


class ScheduledHeadwayTests(unittest.TestCase):
    def test_computes_median_headway_for_cohort_station(self):
        connection = sqlite3.connect(":memory:")
        self.addCleanup(connection.close)
        connection.executescript(SCHEMA)
        connection.execute(
            "INSERT INTO gtfs_routes VALUES ('Red', 'CTA', 'Red', 'Red Line', 1, 'c60c30', 'ffffff')"
        )
        connection.executemany(
            "INSERT INTO gtfs_stops VALUES (?, NULL, ?, 41.0, -87.0, ?, ?)",
            [
                ("40380", "Clark/Lake", 1, None),
                ("30001", "Clark/Lake platform", 0, "40380"),
            ],
        )
        connection.execute(
            "INSERT INTO gtfs_calendar VALUES ('WK', 1, 1, 1, 1, 1, 0, 0, '20260701', '20261231')"
        )
        for index, arrival in enumerate(("06:00:00", "06:10:00", "06:20:00", "06:30:00"), 1):
            trip_id = f"trip-{index}"
            connection.execute(
                "INSERT INTO gtfs_trips VALUES (?, 'Red', 'WK', '95th', '1', NULL, NULL)",
                (trip_id,),
            )
            connection.execute(
                "INSERT INTO gtfs_stop_times VALUES (?, ?, ?, '30001', 1, NULL)",
                (trip_id, arrival, arrival),
            )
        connection.execute(
            "INSERT INTO gtfs_feed_metadata VALUES ('https://example.test/gtfs.zip', 'abc', '2026-07-13T20:00:00+00:00')"
        )

        rows = compute_scheduled_headways(connection, [40380])

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["route_code"], "Red")
        self.assertEqual(rows[0]["service_type"], "weekday")
        self.assertEqual(rows[0]["period_name"], "am_peak")
        self.assertEqual(rows[0]["scheduled_headway_minutes"], 10.0)
        self.assertEqual(rows[0]["trips_sampled"], 4)


if __name__ == "__main__":
    unittest.main()
