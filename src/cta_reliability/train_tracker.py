from __future__ import annotations

import json
import os
import ssl
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

import certifi


BASE_URL = "https://lapi.transitchicago.com/api/1.0/ttarrivals.aspx"
CHICAGO = ZoneInfo("America/Chicago")


class TrainTrackerError(RuntimeError):
    """Raised when CTA rejects or returns an invalid Train Tracker response."""


def _parse_cta_time(value: str) -> datetime:
    for time_format in ("%Y%m%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(value, time_format).replace(tzinfo=CHICAGO)
        except ValueError:
            continue
    raise TrainTrackerError(f"Unexpected CTA timestamp format: {value}")


def fetch_arrivals(station_id: int, max_results: int = 10) -> dict[str, Any]:
    key = os.getenv("CTA_TRAIN_API_KEY", "").strip()
    if not key:
        raise TrainTrackerError("CTA_TRAIN_API_KEY is missing from .env")

    query = urlencode(
        {
            "key": key,
            "mapid": station_id,
            "max": max_results,
            "outputType": "JSON",
        }
    )
    request = Request(f"{BASE_URL}?{query}")
    request.add_header("User-Agent", "cta-transit-reliability/0.1")
    context = ssl.create_default_context(cafile=certifi.where())
    try:
        with urlopen(request, timeout=30, context=context) as response:
            payload = json.load(response)
    except (HTTPError, URLError, TimeoutError) as exc:
        # urllib exceptions may include the request URL, whose query contains the key.
        raise TrainTrackerError(f"CTA request failed ({type(exc).__name__})") from None

    root = payload.get("ctatt")
    if not isinstance(root, dict):
        raise TrainTrackerError("Unexpected CTA response structure")
    if str(root.get("errCd")) != "0":
        raise TrainTrackerError(f"CTA error {root.get('errCd')}: {root.get('errNm')}")
    return root


def transform_arrivals(root: dict[str, Any]) -> list[tuple]:
    snapshot = _parse_cta_time(root["tmst"])
    ingested_at = datetime.now(timezone.utc).isoformat()
    rows = []
    for eta in root.get("eta", []):
        predicted_at = _parse_cta_time(eta["arrT"])
        prediction_at = _parse_cta_time(eta["prdt"])
        seconds_to_arrival = max(0, int((predicted_at - snapshot).total_seconds()))
        rows.append(
            (
                snapshot.isoformat(),
                int(eta["staId"]),
                int(eta["stpId"]),
                eta["staNm"],
                eta["stpDe"],
                eta["rn"],
                eta["rt"],
                eta["destNm"],
                prediction_at.isoformat(),
                predicted_at.isoformat(),
                seconds_to_arrival,
                int(eta["isApp"]),
                int(eta["isSch"]),
                int(eta["isDly"]),
                float(eta["lat"]) if eta.get("lat") else None,
                float(eta["lon"]) if eta.get("lon") else None,
                int(eta["heading"]) if eta.get("heading") else None,
                ingested_at,
            )
        )
    return rows
