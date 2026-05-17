"""Analyze Brazilian real estate auction PDFs using AI agents.

Usage:
    python analyze.py path/to/edital.pdf [path/to/matricula.pdf ...]
"""

import sys
from datetime import datetime
from pathlib import Path

from loguru import logger

from tools.pdf_parser import parse_pdf
from graph.state import AuctionState
from graph.workflow import run_analysis


def main():
    if len(sys.argv) < 2:
        print("Usage: python analyze.py <pdf_path> [pdf_path2 ...]")
        print("  All PDFs must belong to the same property.")
        sys.exit(1)

    pdf_paths = [Path(arg).resolve() for arg in sys.argv[1:]]

    for path in pdf_paths:
        if not path.exists():
            print(f"Error: File not found: {path}")
            sys.exit(1)

    logger.info(f"Analyzing {len(pdf_paths)} document(s) for one property")

    # Step 1: Parse all PDFs
    pdf_data = parse_pdf([str(p) for p in pdf_paths])

    # Step 2: Build initial state
    initial_state = AuctionState(
        pdf_texts=pdf_data["text"],
        pdf_sources=pdf_data["sources"],
    )

    # Step 3: Run the workflow
    result = run_analysis(initial_state)

    # Step 4: Save report
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_dir = Path("reports") / timestamp
    report_dir.mkdir(parents=True, exist_ok=True)

    report_path = report_dir / "report.html"
    report_html = result.report_html if hasattr(result, 'report_html') else result.get("report_html", "<p>No report generated</p>")
    report_path.write_text(report_html, encoding="utf-8")

    logger.info(f"Report saved to {report_path}")
    print(f"\nReport saved to: {report_path}")


if __name__ == "__main__":
    main()
