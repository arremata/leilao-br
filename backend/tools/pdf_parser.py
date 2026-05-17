from pathlib import Path

import fitz
from loguru import logger


def _extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from a single PDF using PyMuPDF. Falls back to OCR if no text found."""
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()

    if text.strip():
        return text

    logger.info(f"No text extracted from {pdf_path}, attempting OCR fallback")
    return _ocr_fallback(pdf_path)


def _ocr_fallback(pdf_path: str) -> str:
    """OCR fallback for scanned/image PDFs using pytesseract."""
    try:
        import pytesseract
        from PIL import Image

        doc = fitz.open(pdf_path)
        text = ""
        for page in doc:
            pix = page.get_pixmap(dpi=300)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            text += pytesseract.image_to_string(img, lang="por") + "\n"
        doc.close()
        return text
    except Exception as e:
        logger.error(f"OCR fallback failed for {pdf_path}: {e}")
        return ""


def _get_metadata(pdf_path: str) -> dict:
    """Extract basic metadata from a PDF."""
    doc = fitz.open(pdf_path)
    meta = {
        "page_count": doc.page_count,
        "file_name": Path(pdf_path).name,
    }
    doc.close()
    return meta


def parse_pdf(pdf_input: str | list[str]) -> dict:
    """Parse one or more PDFs and return combined text + metadata.

    Args:
        pdf_input: A single PDF path or list of PDF paths.

    Returns:
        dict with keys:
            - text: Combined text from all PDFs
            - metadata: List of per-file metadata dicts
            - sources: List of file paths processed
    """
    if isinstance(pdf_input, str):
        pdf_input = [pdf_input]

    combined_text = ""
    all_metadata = []
    sources = []

    for path in pdf_input:
        if not Path(path).exists():
            raise FileNotFoundError(f"PDF not found: {path}")

        logger.info(f"Parsing PDF: {path}")
        text = _extract_text_from_pdf(path)
        metadata = _get_metadata(path)

        combined_text += f"\n--- Documento: {Path(path).name} ---\n{text}\n"
        all_metadata.append(metadata)
        sources.append(path)

    return {
        "text": combined_text.strip(),
        "metadata": all_metadata,
        "sources": sources,
    }
