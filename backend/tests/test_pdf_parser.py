import pytest
from tools.pdf_parser import parse_pdf


def test_parse_pdf_with_text_pdf(tmp_path):
    """Test parsing a real text-based PDF."""
    pdf_path = tmp_path / "test.pdf"
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(
        (72, 72),
        "Edital de Leilão Judicial\n"
        "Endereço: Rua das Flores, 123, Centro, São Paulo - SP\n"
        "Área: 80m²\n"
        "Valor de Avaliação: R$ 500.000,00\n"
        "Valor de 1ª Praça: R$ 350.000,00\n"
        "Matrícula: 123.456\n"
        "Leiloeiro: João da Silva\n"
        "Data do Leilão: 15/06/2025",
    )
    doc.save(str(pdf_path))
    doc.close()

    result = parse_pdf(str(pdf_path))

    assert "text" in result
    assert "Rua das Flores" in result["text"]
    assert "metadata" in result
    assert result["metadata"][0]["page_count"] == 1


def test_parse_pdf_file_not_found():
    """Test that missing file raises FileNotFoundError."""
    with pytest.raises(FileNotFoundError):
        parse_pdf("/nonexistent/file.pdf")


def test_parse_multiple_pdfs(tmp_path):
    """Test parsing multiple PDFs into a combined result."""
    import fitz

    paths = []
    for i in range(2):
        pdf_path = tmp_path / f"doc_{i}.pdf"
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((72, 72), f"Document {i}: Content about property")
        doc.save(str(pdf_path))
        doc.close()
        paths.append(str(pdf_path))

    result = parse_pdf(paths)

    assert "Document 0" in result["text"]
    assert "Document 1" in result["text"]
