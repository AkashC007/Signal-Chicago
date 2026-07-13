from __future__ import annotations

import json
import os
import ssl
from datetime import date, datetime, timezone
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import certifi


class InvalidRidershipRecord(ValueError):
    """Raised when a source record fails required data-quality rules."""


def fetch_ridership(url: str, limit: int | None = None) -> list[dict[str, Any]]:
    params = {
        "$limit": str(limit or 50_000),
        "$order": "service_date ASC",
    }
    request = Request(f"{url}?{urlencode(params)}")
    request.add_header("User-Agent", "cta-transit-reliability/0.1")
    token = os.getenv("SOCRATA_APP_TOKEN")
    if token:
        request.add_header("X-App-Token", token)

    ssl_context = ssl.create_default_context(cafile=certifi.where())
    with urlopen(request, timeout=30, context=ssl_context) as response:
        payload = json.load(response)

    if not isinstance(payload, list):
        raise RuntimeError("Unexpected Socrata response: expected a JSON list")
    return payload


def transform_record(record: dict[str, Any], fetched_at: str | None = None) -> tuple:
    required = ("service_date", "day_type", "bus", "rail_boardings", "total_rides")
    missing = [field for field in required if field not in record]
    if missing:
        raise InvalidRidershipRecord(f"Missing fields: {', '.join(missing)}")

    try:
        service_date = date.fromisoformat(str(record["service_date"])[:10]).isoformat()
        bus_rides = int(record["bus"])
        rail_rides = int(record["rail_boardings"])
        total_rides = int(record["total_rides"])
    except (TypeError, ValueError) as exc:
        raise InvalidRidershipRecord("Invalid date or numeric value") from exc

    day_type = str(record["day_type"])
    if day_type not in {"W", "A", "U"}:
        raise InvalidRidershipRecord(f"Unexpected day_type: {day_type}")
    if min(bus_rides, rail_rides, total_rides) < 0:
        raise InvalidRidershipRecord("Ridership counts cannot be negative")
    if bus_rides + rail_rides != total_rides:
        raise InvalidRidershipRecord("total_rides does not equal bus plus rail")

    fetched_at = fetched_at or datetime.now(timezone.utc).isoformat()
    return service_date, day_type, bus_rides, rail_rides, total_rides, fetched_at
