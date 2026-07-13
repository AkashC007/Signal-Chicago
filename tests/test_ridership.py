import unittest

from cta_reliability.ridership import InvalidRidershipRecord, transform_record


class TransformRidershipTests(unittest.TestCase):
    def setUp(self):
        self.record = {
            "service_date": "2026-01-02T00:00:00.000",
            "day_type": "W",
            "bus": "600000",
            "rail_boardings": "400000",
            "total_rides": "1000000",
        }

    def test_transforms_valid_source_record(self):
        row = transform_record(self.record, fetched_at="2026-01-03T00:00:00+00:00")
        self.assertEqual(
            row,
            ("2026-01-02", "W", 600000, 400000, 1000000, "2026-01-03T00:00:00+00:00"),
        )

    def test_rejects_inconsistent_total(self):
        self.record["total_rides"] = "999999"
        with self.assertRaises(InvalidRidershipRecord):
            transform_record(self.record)

    def test_rejects_unknown_day_type(self):
        self.record["day_type"] = "X"
        with self.assertRaises(InvalidRidershipRecord):
            transform_record(self.record)


if __name__ == "__main__":
    unittest.main()

