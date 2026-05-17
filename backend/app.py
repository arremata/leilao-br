"""Gradio UI for Leilao AI - paste a URL or drag-and-drop PDFs, get analysis JSON."""

import json
from datetime import datetime
from pathlib import Path

import gradio as gr
from loguru import logger

from tools.pdf_parser import parse_pdf
from graph.state import AuctionState
from graph.workflow import run_analysis


def analyze_url(url: str) -> dict:
    """Analyze an auction from a URL and return structured JSON."""
    if not url or not url.strip():
        return {"error": "Please enter an auction URL."}

    url = url.strip()

    try:
        logger.info(f"Analyzing auction from URL: {url}")

        initial_state = AuctionState(auction_url=url)
        result = run_analysis(initial_state)

        result_json = result.get("result_json", "") if isinstance(result, dict) else getattr(result, "result_json", "")

        if not result_json:
            return {"error": "Analysis completed but no result was generated."}

        return json.loads(result_json)

    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        return {"error": f"Analysis failed: {e}"}


def analyze_pdfs(files):
    """Analyze uploaded PDFs and return structured JSON."""
    if not files:
        return {"error": "Please upload at least one PDF."}

    try:
        pdf_paths = [f for f in files]

        logger.info(f"Analyzing {len(pdf_paths)} document(s)")

        pdf_data = parse_pdf(pdf_paths)

        if not pdf_data["text"].strip():
            return {"error": "Could not extract text from the uploaded PDFs. They may be scanned images without OCR."}

        initial_state = AuctionState(
            pdf_texts=pdf_data["text"],
            pdf_sources=pdf_data["sources"],
        )

        result = run_analysis(initial_state)

        result_json = result.get("result_json", "") if isinstance(result, dict) else getattr(result, "result_json", "")

        if not result_json:
            return {"error": "Analysis completed but no result was generated."}

        return json.loads(result_json)

    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        return {"error": f"Analysis failed: {e}"}


with gr.Blocks(
    title="Leilao AI - Analise de Leilao de Imovel",
) as app:
    gr.Markdown("# Leilao AI - Analise de Leilao de Imovel")

    with gr.Tab("URL do Leilao"):
        gr.Markdown("Cole a URL do leilao (Caixa, leiloeiro, site judicial, etc.)")
        url_input = gr.Textbox(
            label="URL do Leilao",
            placeholder="https://leiloes.caixa.gov.br/leilao/...",
        )
        url_btn = gr.Button("Analisar", variant="primary")

    with gr.Tab("Upload PDFs"):
        gr.Markdown("Arraste os PDFs do leilao (edital, matricula, laudo, certidoes)")
        file_input = gr.File(
            label="PDFs do Leilao",
            file_count="multiple",
            file_types=[".pdf"],
        )
        pdf_btn = gr.Button("Analisar", variant="primary")

    gr.Markdown("### Resultado")
    result_output = gr.JSON(label="Resultado de Analise")

    url_btn.click(
        fn=analyze_url,
        inputs=url_input,
        outputs=result_output,
    )

    pdf_btn.click(
        fn=analyze_pdfs,
        inputs=file_input,
        outputs=result_output,
    )


if __name__ == "__main__":
    app.launch(server_name="0.0.0.0", server_port=7860)
