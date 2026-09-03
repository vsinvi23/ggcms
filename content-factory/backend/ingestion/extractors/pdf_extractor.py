import pymupdf as fitz  # PyMuPDF (import name changed from `fitz`; alias kept for readability)


def extract_text_from_pdf(pdf_bytes: bytes) -> dict:
    """
    Extracts text, page count, and a bookmark-derived section map from a PDF.

    Uses PyMuPDF (fitz). Mirrors the shape of the `knowledge_document` table
    (§2 of IMPLEMENTATION_SPECIFICATION.md): extracted_text, section_map, page_count.

    Returns:
        {
            "text": str,                # full extracted text, pages joined with "\n\n"
            "page_count": int,
            "section_map": dict | None, # {heading: {"page": int, "level": int}} from the
                                         # PDF's table of contents (bookmarks), if present
        }
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        page_count = doc.page_count

        pages_text = []
        for page in doc:
            pages_text.append(page.get_text("text") or "")
        text = "\n\n".join(pages_text)

        section_map = _build_section_map(doc)

        return {
            "text": text,
            "page_count": page_count,
            "section_map": section_map,
        }
    finally:
        doc.close()


def _build_section_map(doc: "fitz.Document") -> dict | None:
    """
    Builds a {heading: {page, level}} map from the PDF's bookmarks/table of contents.
    Returns None if the PDF has no bookmarks (most don't).
    """
    toc = doc.get_toc(simple=True)  # list of [level, title, page (1-based)]
    if not toc:
        return None

    section_map = {}
    for level, title, page in toc:
        # page from get_toc is 1-based; store 0-based to match page indices used elsewhere.
        section_map[title] = {"page": max(page - 1, 0), "level": level}
    return section_map
