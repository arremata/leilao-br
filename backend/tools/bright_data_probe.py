"""Temporary read-only probe for the managed comparable sources."""

from __future__ import annotations

import asyncio
import json
import time

from graph.state import PropertyMetadata
from tools.property_scraper import (
    BrightDataWebUnlocker,
    _is_usable_comparable,
    _launch_stealth_browser,
    scrape_chavesnamao,
    scrape_imovelweb,
    scrape_quintoandar,
)


async def main() -> None:
    metadata = PropertyMetadata(
        address="",
        property_type="Apartamento",
        area_m2=70,
        auction_price=400_000,
        city="Curitiba",
        neighborhood="Água Verde",
        state="PR",
    )
    sources = (
        ("QuintoAndar", scrape_quintoandar),
        ("Chaves na Mão", scrape_chavesnamao),
        ("ImovelWeb", scrape_imovelweb),
    )
    failures = []
    async with BrightDataWebUnlocker.from_env() as unlocker:
        playwright, browser, page = await _launch_stealth_browser()
        try:
            for name, scraper in sources:
                started_at = time.monotonic()
                try:
                    comparables = await scraper(
                        page,
                        metadata,
                        location_override=metadata.neighborhood,
                        unlocker=unlocker,
                    )
                    valid = [item for item in comparables if _is_usable_comparable(item)]
                    report = {
                        "source": name,
                        "parsed": len(comparables),
                        "valid": len(valid),
                        "elapsed_seconds": round(time.monotonic() - started_at, 2),
                        "sample_urls": [item.url for item in valid[:2]],
                    }
                    print(json.dumps(report, ensure_ascii=False), flush=True)
                    if not valid:
                        failures.append(name)
                except Exception as exc:
                    print(json.dumps({
                        "source": name,
                        "elapsed_seconds": round(time.monotonic() - started_at, 2),
                        "error": f"{type(exc).__name__}: {exc}",
                    }, ensure_ascii=False), flush=True)
                    failures.append(name)
        finally:
            try:
                await browser.close()
            finally:
                await playwright.stop()
    if failures:
        raise SystemExit("No valid cards for: " + ", ".join(failures))


if __name__ == "__main__":
    asyncio.run(main())
