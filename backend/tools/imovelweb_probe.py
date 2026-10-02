"""Read-only GitHub runner probe for the ImovelWeb collector."""

from __future__ import annotations

import asyncio
import json

from graph.state import PropertyMetadata
from tools.property_scraper import _launch_stealth_browser, scrape_imovelweb


async def _probe() -> None:
    playwright, browser, page = await _launch_stealth_browser(channel="chrome")
    try:
        metadata = PropertyMetadata(
            city="Sao Paulo",
            neighborhood="Moema",
            state="SP",
            property_type="Apartamento",
            area_m2=80,
        )
        comparables = await scrape_imovelweb(
            page, metadata, location_override="Moema",
        )
        print(json.dumps({
            "comparables": len(comparables),
            "sample_url": comparables[0].url if comparables else None,
        }))
        if not comparables:
            raise RuntimeError("ImovelWeb probe returned no comparable listings")
    finally:
        await browser.close()
        await playwright.stop()


if __name__ == "__main__":
    asyncio.run(_probe())
