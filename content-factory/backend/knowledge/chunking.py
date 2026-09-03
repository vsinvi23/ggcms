import re

# Matches ATX-style markdown headings ("# Heading", "## Heading", ...) at line start.
_HEADING_RE = re.compile(r"^(#{1,6})\s+.+$", re.MULTILINE)

# Rough word-based token estimate: no tokenizer dependency is in requirements.txt,
# so we approximate 1 "token" ~= 1 whitespace-delimited word. Good enough for
# chunk-sizing purposes (the spec's 500-800 token target is itself a loose band).
_WORD_RE = re.compile(r"\S+")


def _estimate_tokens(text: str) -> int:
    return len(_WORD_RE.findall(text))


def _split_on_headings(text: str) -> list[str]:
    """
    Splits text into sections on markdown headings, keeping each heading with the
    content that follows it. Text before the first heading (if any) is its own section.
    """
    matches = list(_HEADING_RE.finditer(text))
    if not matches:
        return [text]

    sections = []
    first_start = matches[0].start()
    if first_start > 0:
        preamble = text[:first_start]
        if preamble.strip():
            sections.append(preamble)

    for i, match in enumerate(matches):
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        section = text[start:end]
        if section.strip():
            sections.append(section)

    return sections


def _words_with_spans(text: str) -> list[str]:
    return _WORD_RE.findall(text)


def _hard_wrap_section(section: str, chunk_size_tokens: int, overlap_tokens: int) -> list[str]:
    """
    Hard-wraps a single (possibly oversized) section into word-count-bounded chunks
    with a trailing overlap of `overlap_tokens` words carried into the next chunk.
    """
    words = _words_with_spans(section)
    if not words:
        return []

    if len(words) <= chunk_size_tokens:
        return [section.strip()]

    chunks = []
    step = max(chunk_size_tokens - overlap_tokens, 1)
    start = 0
    while start < len(words):
        end = min(start + chunk_size_tokens, len(words))
        chunk_words = words[start:end]
        chunks.append(" ".join(chunk_words))
        if end >= len(words):
            break
        start += step

    return chunks


def chunk_text(text: str, chunk_size_tokens: int = 600, overlap_pct: float = 0.12) -> list[str]:
    """
    Splits `text` into section-aware chunks of ~`chunk_size_tokens` tokens with
    `overlap_pct` overlap between consecutive chunks, per IMPLEMENTATION_SPECIFICATION.md §7:

        chunk -> ~500-800 token chunks with 10-15% overlap, section-aware
                 (split on headings first, then hard-wrap oversized sections)

    Sections are split on markdown headings first. Sections that fit within
    `chunk_size_tokens` become a single chunk each; oversized sections are hard-wrapped
    with overlap. Adjacent same-section chunks and small consecutive sections may be
    merged is intentionally NOT done here -- each returned chunk maps to a contiguous
    span of the source text (or a heading-bounded section of it).

    Returns a list of chunk strings (empty list for empty/whitespace-only input).
    """
    if not text or not text.strip():
        return []

    overlap_tokens = int(round(chunk_size_tokens * overlap_pct))

    sections = _split_on_headings(text)

    chunks: list[str] = []
    for section in sections:
        section_tokens = _estimate_tokens(section)
        if section_tokens == 0:
            continue
        if section_tokens <= chunk_size_tokens:
            stripped = section.strip()
            if stripped:
                chunks.append(stripped)
        else:
            chunks.extend(_hard_wrap_section(section, chunk_size_tokens, overlap_tokens))

    return chunks
