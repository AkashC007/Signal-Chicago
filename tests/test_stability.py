import sqlite3
import unittest

from cta_reliability.warehouse import SCHEMA


class StabilityViewTests(unittest.TestCase):
    def test_calculates_eta_revision_between_snapshots(self):
        connection = sqlite3.connect(":memory:")
        connection.executescript(SCHEMA)
        base = (
            40380, 30074, "Clark/Lake", "Forest Park platform", "123", "Blue",
            "Forest Park", "2026-07-13T15:00:00-05:00", 600, 0, 0, 0,
            41.885, -87.630, 180, "2026-07-13T20:00:00+00:00",
        )
        connection.execute(
            "INSERT INTO train_arrival_predictions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("2026-07-13T15:00:00-05:00",) + base[:8]
            + ("2026-07-13T15:10:00-05:00",) + base[8:],
        )
        connection.execute(
            "INSERT INTO train_arrival_predictions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("2026-07-13T15:02:00-05:00",) + base[:8]
            + ("2026-07-13T15:13:00-05:00",) + base[8:],
        )
        revisions = connection.execute(
            "SELECT eta_revision_minutes FROM vw_eta_revisions ORDER BY snapshot_at"
        ).fetchall()
        self.assertIsNone(revisions[0][0])
        self.assertEqual(revisions[1][0], 3.0)


if __name__ == "__main__":
    unittest.main()
