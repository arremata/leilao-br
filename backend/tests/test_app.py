"""Tests for the Gradio app entry points."""
from unittest.mock import patch


def test_analyze_url_calls_workflow():
    """analyze_url should build AuctionState with auction_url and call run_analysis."""
    from app import analyze_url

    result_json = '{"id":"abc","risk":{"j":"good","f":"good","l":"warn","o":"good"}}'
    with patch("app.run_analysis") as mock_run:
        mock_run.return_value = {"result_json": result_json}
        result = analyze_url("https://leiloes.caixa.gov.br/leilao/123")

    mock_run.assert_called_once()
    call_args = mock_run.call_args[0][0]
    assert call_args.auction_url == "https://leiloes.caixa.gov.br/leilao/123"
    assert result["risk"]["j"] == "good"


def test_analyze_url_no_url():
    """analyze_url with empty URL should return an error dict."""
    from app import analyze_url

    result = analyze_url("")
    assert "error" in result


def test_analyze_pdfs_calls_workflow():
    """analyze_pdfs should build AuctionState with pdf_texts and call run_analysis."""
    from app import analyze_pdfs

    result_json = '{"id":"abc","risk":{"j":"warn","f":"good","l":"good","o":"warn"}}'
    with (
        patch("app.parse_pdf") as mock_parse,
        patch("app.run_analysis") as mock_run,
    ):
        mock_parse.return_value = {"text": "Edital de Leilao", "sources": ["edital.pdf"]}
        mock_run.return_value = {"result_json": result_json}

        result = analyze_pdfs(["/tmp/fake.pdf"])

    mock_run.assert_called_once()
    call_args = mock_run.call_args[0][0]
    assert call_args.pdf_texts == "Edital de Leilao"
    assert result["risk"]["j"] == "warn"


def test_analyze_pdfs_no_files():
    """analyze_pdfs with no files should return an error dict."""
    from app import analyze_pdfs

    result = analyze_pdfs(None)
    assert "error" in result


def test_analyze_pdfs_empty_text():
    """analyze_pdfs with unparseable PDFs should return an error dict."""
    from app import analyze_pdfs

    with patch("app.parse_pdf") as mock_parse:
        mock_parse.return_value = {"text": "", "sources": []}
        result = analyze_pdfs(["/tmp/fake.pdf"])

    assert "error" in result
