"""Nominatim (OpenStreetMap) geocoder.

Nominatim's usage policy requires an identifying User-Agent and at most ~1
request/second. `min_interval_s` throttles calls; tests pass 0 to disable.
"""

from __future__ import annotations

import time
from typing import Optional

USER_AGENT = "leilao-ai/1.0 (auction catalog ingestion)"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"


class NominatimClient:
    def __init__(self, http_client=None, min_interval_s: float = 1.0):
        if http_client is None:
            import httpx

            http_client = httpx.Client()
        self._http = http_client
        self._min_interval = min_interval_s
        self._last_call = 0.0

    def _throttle(self) -> None:
        if self._min_interval <= 0:
            return
        elapsed = time.monotonic() - self._last_call
        if elapsed < self._min_interval:
            time.sleep(self._min_interval - elapsed)
        self._last_call = time.monotonic()

    def geocode(self, address: str) -> Optional[tuple[float, float]]:
        if not address or not address.strip():
            return None
        self._throttle()
        resp = self._http.get(
            NOMINATIM_URL,
            params={"q": address, "format": "json", "limit": 1, "countrycodes": "br"},
            headers={"User-Agent": USER_AGENT},
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data:
            return None
        try:
            return (float(data[0]["lat"]), float(data[0]["lon"]))
        except (KeyError, ValueError, IndexError):
            return None

    def close(self) -> None:
        close = getattr(self._http, "close", None)
        if close is not None:
            close()
