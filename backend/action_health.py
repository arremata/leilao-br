"""Turn worker result JSON into visible, non-fatal GitHub Action warnings."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


def _github_escape(value: str) -> str:
    return value.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def ingestion_report(data: dict) -> tuple[list[str], str]:
    failed_ufs = data.get("failed_ufs", [])
    degraded_ufs = data.get("degraded_date_ufs", [])
    warnings: list[str] = []
    if degraded_ufs:
        failures = 0
        attempted = 0
        for uf in degraded_ufs:
            summary = (data.get("ufs", {}).get(uf, {}).get("summary") or {})
            failures += int(summary.get("dates_failed", 0))
            attempted += int(summary.get("dates_updated", 0))
            attempted += int(summary.get("dates_failed", 0))
        warnings.append(
            "Caixa detail enrichment was incomplete for "
            f"{', '.join(degraded_ufs)}: {failures}/{attempted} auction dates unavailable. "
            "The authoritative catalog import still completed and existing facts were preserved."
        )
    lines = ["## Caixa ingestion health", ""]
    lines.append(
        f"- Authoritative catalog: {'failed' if failed_ufs else 'completed'}"
    )
    lines.append(
        "- Detail enrichment: "
        + (f"degraded ({', '.join(degraded_ufs)})" if degraded_ufs else "healthy")
    )
    if data.get("ufs"):
        lines.extend([
            "",
            "| UF | Catálogo | Duração | Detalhes | Adiados | Fotos | Removidos |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
        ])
        for uf, result in sorted(data["ufs"].items()):
            summary = result.get("summary") or {}
            duration = float(result.get("duration_seconds") or 0)
            catalog = summary.get("catalog_rows", "—")
            details = summary.get("details_attempted", "—")
            deferred = summary.get("details_deferred", "—")
            photos = summary.get("photos_attempted", "—")
            removed = summary.get("removed", "—")
            lines.append(
                f"| {uf} | {catalog} | {duration:.1f}s | {details} | "
                f"{deferred} | {photos} | {removed} |"
            )
    if warnings:
        lines.extend(["", *[f"> [!WARNING]\n> {warning}" for warning in warnings]])
    return warnings, "\n".join(lines) + "\n"


def market_report(data: dict) -> tuple[list[str], str]:
    failed = int(data.get("failed", 0))
    selected = int(data.get("selected", 0))
    warnings = []
    if failed:
        warnings.append(
            f"{failed}/{selected} regional market jobs had only unavailable sources. "
            "They remain recorded for retry and no previous healthy reference was erased."
        )
    lines = [
        "## Regional market health",
        "",
        f"- Selected: {selected}",
        f"- Updated: {int(data.get('updated', 0))}",
        f"- Valid empty results: {int(data.get('empty', 0))}",
        f"- Deferred for retry: {failed}",
    ]
    if warnings:
        lines.extend(["", *[f"> [!WARNING]\n> {warning}" for warning in warnings]])
    return warnings, "\n".join(lines) + "\n"


def publish(kind: str, result_file: str, summary_file: str = "") -> None:
    data = json.loads(Path(result_file).read_text(encoding="utf-8"))
    warnings, markdown = (
        ingestion_report(data) if kind == "ingestion" else market_report(data)
    )
    for warning in warnings:
        print(f"::warning title=Partial source degradation::{_github_escape(warning)}")
    if summary_file:
        with Path(summary_file).open("a", encoding="utf-8") as output:
            output.write(markdown)
    print(markdown, end="")


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description="Publish structured worker health")
    parser.add_argument("kind", choices=("ingestion", "market"))
    parser.add_argument("result_file")
    args = parser.parse_args(argv)
    publish(
        args.kind,
        args.result_file,
        os.environ.get("GITHUB_STEP_SUMMARY", ""),
    )


if __name__ == "__main__":
    main()
