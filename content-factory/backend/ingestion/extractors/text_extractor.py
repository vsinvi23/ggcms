def extract_text_from_text(raw_bytes: bytes) -> str:
    """
    Plain-text/markdown extraction: decode as UTF-8 and return as-is.
    Markdown is stored as raw text (not rendered) -- the knowledge pipeline
    only needs readable text to chunk and keyword-search over.
    """
    return raw_bytes.decode("utf-8", errors="ignore")
