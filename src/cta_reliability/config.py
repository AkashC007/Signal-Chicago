from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    project_root: Path
    warehouse_path: Path
    ridership_url: str = "https://data.cityofchicago.org/resource/6iiy-9s97.json"
    gtfs_url: str = "https://www.transitchicago.com/downloads/sch_data/google_transit.zip"
    gtfs_archive_path: Path | None = None
    station_config_path: Path | None = None

    @classmethod
    def default(cls) -> "Settings":
        root = Path(__file__).resolve().parents[2]
        return cls(
            project_root=root,
            warehouse_path=root / "data" / "warehouse" / "cta_reliability.db",
            gtfs_archive_path=root / "data" / "raw" / "google_transit.zip",
            station_config_path=root / "config" / "stations.json",
        )


def load_project_env(project_root: Path) -> None:
    """Load simple KEY=VALUE entries without overriding the shell environment."""
    env_path = project_root / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip())
