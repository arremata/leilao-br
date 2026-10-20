import json
from pathlib import Path

from action_health import ingestion_report, market_report, publish


def test_ingestion_report_warns_without_calling_catalog_failed():
    warnings, markdown = ingestion_report({
        "failed_ufs": [],
        "degraded_date_ufs": ["PR"],
        "ufs": {
            "PR": {
                "duration_seconds": 245.2,
                "summary": {
                    "catalog_rows": 421, "dates_updated": 72,
                    "dates_failed": 155, "details_attempted": 160,
                    "details_deferred": 46, "photos_attempted": 3,
                    "removed": 0,
                },
            },
        },
    })

    assert "155/227" in warnings[0]
    assert "Authoritative catalog: completed" in markdown
    assert "Detail enrichment: degraded (PR)" in markdown
    assert "| PR | 421 | 245.2s | 160 | 46 | 3 | 0 |" in markdown


def test_market_report_exposes_retryable_jobs_as_a_warning():
    warnings, markdown = market_report({
        "selected": 2, "updated": 0, "empty": 0, "failed": 2,
    })

    assert "2/2" in warnings[0]
    assert "Deferred for retry: 2" in markdown


def test_publish_adds_annotation_and_job_summary(tmp_path, capsys):
    result_file = tmp_path / "result.json"
    summary_file = tmp_path / "summary.md"
    result_file.write_text(json.dumps({
        "selected": 1, "updated": 0, "empty": 0, "failed": 1,
    }))

    publish("market", str(result_file), str(summary_file))

    assert "::warning title=Partial source degradation::" in capsys.readouterr().out
    assert "Deferred for retry: 1" in summary_file.read_text()


def test_ingestion_workflow_bounds_details_and_preserves_materialization():
    workflow = (
        Path(__file__).resolve().parents[2]
        / ".github" / "workflows" / "ingest.yml"
    ).read_text()

    assert "INGEST_DETAIL_LIMIT:" in workflow
    assert "default: \"160\"" in workflow
    assert '--date-limit "$INGEST_DETAIL_LIMIT"' in workflow
    assert "Report optional detail health" in workflow
    assert "Refresh analyses changed by catalog ingestion" in workflow
