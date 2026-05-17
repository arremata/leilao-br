"""Download PDF files from URLs to a local temp directory."""

import tempfile
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from loguru import logger

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
DOWNLOAD_TIMEOUT = 30  # seconds
PDF_MAGIC = b"%PDF"


def _resolve_url(url: str, page_url: str) -> str:
    """Resolve a potentially relative URL against the page URL.

    Handles absolute URLs, root-relative (/path), path-relative (file.pdf),
    and protocol-relative (//host/path) URLs using urljoin.

    Args:
        url: The URL to resolve (may be relative or absolute).
        page_url: The base URL of the page where the link was found.

    Returns:
        Absolute URL string.
    """
    if url.startswith(("http://", "https://")):
        return url
    return urljoin(page_url, url)


def _filename_from_response(url: str, response: httpx.Response) -> str:
    """Extract filename from Content-Disposition header or fall back to URL path.

    Args:
        url: The request URL.
        response: The HTTP response.

    Returns:
        Filename string.
    """
    cd = response.headers.get("content-disposition", "")
    if "filename=" in cd:
        for part in cd.split(";"):
            part = part.strip()
            if part.startswith("filename="):
                name = part.split("=", 1)[1].strip().strip('"').strip("'")
                if name:
                    return name

    path = urlparse(url).path
    basename = Path(path).name
    if basename and basename.endswith(".pdf"):
        return basename

    return "document.pdf"


async def download_pdfs(pdf_urls: list[str], page_url: str) -> list[str]:
    """Download PDF files from URLs to a local temp directory.

    Args:
        pdf_urls: List of PDF URLs to download (may be relative).
        page_url: Base URL for resolving relative URLs.

    Returns:
        List of local file paths for successfully downloaded PDFs.
    """
    if not pdf_urls:
        return []

    tmp_dir = tempfile.mkdtemp(prefix="leilao_pdfs_")
    downloaded = []

    async with httpx.AsyncClient(timeout=DOWNLOAD_TIMEOUT, follow_redirects=True) as client:
        for url in pdf_urls:
            resolved = _resolve_url(url, page_url)
            try:
                response = await client.get(resolved)
                response.raise_for_status()

                if len(response.content) > MAX_FILE_SIZE:
                    logger.warning(f"Skipping {resolved}: file too large ({len(response.content)} bytes)")
                    continue

                if not response.content.startswith(PDF_MAGIC):
                    logger.warning(f"Skipping {resolved}: content is not a valid PDF")
                    continue

                filename = _filename_from_response(resolved, response)
                local_path = Path(tmp_dir) / filename

                # Avoid overwriting files with same name
                counter = 1
                while local_path.exists():
                    stem = Path(filename).stem
                    local_path = Path(tmp_dir) / f"{stem}_{counter}.pdf"
                    counter += 1

                local_path.write_bytes(response.content)
                downloaded.append(str(local_path))
                logger.info(f"Downloaded {resolved} -> {local_path}")

            except Exception as e:
                logger.warning(f"Failed to download {resolved}: {e}")
                continue

    return downloaded
