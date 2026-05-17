from loguru import logger
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

STEALTH_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)

DOWNLOAD_CLICK_TIMEOUT_MS = 5000


async def scrape_page(url: str, wait_seconds: int = 5) -> dict:
    """Scrape a web page using Playwright with stealth patches (headless Chromium).

    Args:
        url: URL to scrape.
        wait_seconds: Seconds to wait for JS rendering.

    Returns:
        dict with keys: url, title, html
    """
    pw = await async_playwright().start()
    try:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=STEALTH_USER_AGENT,
            viewport={"width": 1920, "height": 1080},
        )
        page = await context.new_page()
        await Stealth().apply_stealth_async(page)

        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(wait_seconds * 1000)

        html = await page.content()
        title = await page.title()

        await page.close()
        await browser.close()

        return {"url": url, "title": title, "html": html}
    except Exception as e:
        logger.error(f"Scraping failed for {url}: {e}")
        return {"url": url, "title": "", "html": ""}
    finally:
        await pw.stop()


async def extract_dynamic_pdf_urls(url: str, wait_seconds: int = 5) -> list[str]:
    """Click PDF-linked elements on a page and intercept their download URLs.

    Many SPA auction sites (e.g. Kron/Superbid) render PDF filenames as text
    labels without href attributes. The actual download URL is only resolved
    when the user clicks the element. This function finds such elements,
    clicks each one, and captures the download URL via Playwright's download
    event.

    Args:
        url: Page URL to scrape.
        wait_seconds: Seconds to wait for JS rendering.

    Returns:
        List of intercepted PDF download URLs.
    """
    pw = await async_playwright().start()
    pdf_urls: list[str] = []
    try:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            accept_downloads=True,
            user_agent=STEALTH_USER_AGENT,
            viewport={"width": 1920, "height": 1080},
        )
        page = await context.new_page()
        await Stealth().apply_stealth_async(page)

        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(wait_seconds * 1000)

        # Try clicking an "Anexos" tab if present (common in Superbid/Kron sites)
        anexos_tab = page.locator("#Anexos")
        if await anexos_tab.count() > 0:
            logger.info("Scraper: clicking ANEXOS tab")
            await anexos_tab.click()
            await page.wait_for_timeout(1000)

        # Find PDF label elements: <a> tags whose text ends in .pdf but lack href
        pdf_labels = page.locator('a[alt="la"]')
        count = await pdf_labels.count()

        if count == 0:
            # Broader fallback: any element whose visible text contains .pdf
            pdf_labels = page.locator("li:has(img[src*='pdf'])")
            count = await pdf_labels.count()

        logger.info(f"Scraper: found {count} clickable PDF elements")

        for i in range(count):
            item = pdf_labels.nth(i)
            text = (await item.text_content() or "").strip()

            # Try clicking the button inside the item, or the item itself
            clickable = item.locator("button").first
            if await clickable.count() == 0:
                clickable = item

            try:
                async with page.expect_download(timeout=DOWNLOAD_CLICK_TIMEOUT_MS) as dl_info:
                    await clickable.click()
                download = await dl_info.value
                dl_url = download.url
                if dl_url and dl_url not in pdf_urls:
                    pdf_urls.append(dl_url)
                    logger.info(f"Scraper: intercepted download for '{text}': {dl_url}")
                # Cancel the actual download to avoid writing temp files
                await download.cancel()
            except Exception:
                logger.debug(f"Scraper: no download triggered for '{text}'")

        await browser.close()
    except Exception as e:
        logger.error(f"Dynamic PDF extraction failed for {url}: {e}")
    finally:
        await pw.stop()

    return pdf_urls


async def scrape_pages(urls: list[str], wait_seconds: int = 3) -> list[dict]:
    """Scrape multiple pages sequentially (to avoid rate limiting).

    Args:
        urls: List of URLs to scrape.
        wait_seconds: Seconds to wait per page for JS rendering.

    Returns:
        List of scrape result dicts.
    """
    results = []
    for url in urls:
        result = await scrape_page(url, wait_seconds)
        results.append(result)
    return results
