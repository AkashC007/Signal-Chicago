import unittest

from cta_reliability.train_tracker import transform_arrivals


class TransformTrainTrackerTests(unittest.TestCase):
    def test_transforms_arrival_prediction(self):
        root = {
            "tmst": "20260710 12:00:00",
            "eta": [
                {
                    "staId": "40380",
                    "stpId": "30173",
                    "staNm": "Clark/Lake",
                    "stpDe": "Service toward Forest Park",
                    "rn": "123",
                    "rt": "Blue",
                    "destNm": "Forest Park",
                    "prdt": "20260710 11:59:30",
                    "arrT": "20260710 12:05:00",
                    "isApp": "0",
                    "isSch": "0",
                    "isDly": "0",
                    "lat": "41.885",
                    "lon": "-87.630",
                    "heading": "180",
                }
            ],
        }
        rows = transform_arrivals(root)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][1:8], (40380, 30173, "Clark/Lake", "Service toward Forest Park", "123", "Blue", "Forest Park"))
        self.assertEqual(rows[0][10], 300)

    def test_accepts_current_iso_timestamp_format(self):
        root = {
            "tmst": "2026-07-10T12:00:00",
            "eta": [
                {
                    "staId": "40380", "stpId": "30173", "staNm": "Clark/Lake",
                    "stpDe": "Service toward Forest Park", "rn": "123", "rt": "Blue",
                    "destNm": "Forest Park", "prdt": "2026-07-10T11:59:30",
                    "arrT": "2026-07-10T12:05:00", "isApp": "0", "isSch": "0",
                    "isDly": "0", "lat": "", "lon": "", "heading": "",
                }
            ],
        }
        self.assertEqual(transform_arrivals(root)[0][10], 300)


if __name__ == "__main__":
    unittest.main()
