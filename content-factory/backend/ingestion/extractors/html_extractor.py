import trafilatura

def extract_text_from_html(html_content: str) -> str:
    """
    Salvaged from legacy article_platform.
    Uses trafilatura to extract clean text from HTML content, dropping ads and boilerplate.
    """
    text = trafilatura.extract(
        html_content, 
        include_comments=False, 
        include_tables=True, 
        no_fallback=False
    )
    return text or ""

