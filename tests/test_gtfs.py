import tempfile
import unittest
import zipfile
from pathlib import Path

from cta_reliability.gtfs import GTFSError, validate_archive


class GTFSValidationTests(unittest.TestCase):
    def test_rejects_archive_missing_required_tables(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "feed.zip"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("routes.txt", "route_id,route_type\nRed,1\n")
            with self.assertRaises(GTFSError):
                validate_archive(path)


if __name__ == "__main__":
    unittest.main()
