"""
Pure-stdlib originality/near-copy detection.

Given a draft's text and the raw source chunks it was written from, estimates
how much of the draft is lifted near-verbatim from the sources. This is a
cheap heuristic guardrail (n-gram overlap), not a plagiarism-detection
service -- it does not check against the web or any external corpus.
"""

import re

# Word-level n-gram size used for overlap comparison.
DEFAULT_NGRAM_SIZE = 8

# If this fraction (or more) of the draft's n-grams also appear in the
# source n-grams, flag the draft as a likely near-copy.
OVERLAP_RATIO_WARNING_THRESHOLD = 0.35

# If the longest run of consecutive words copied verbatim from the source
# reaches this many words, flag the draft as a likely near-copy.
LONGEST_RUN_WARNING_THRESHOLD = 40


def _tokenize(text: str) -> list[str]:
    """Lowercases and splits on runs of non-alphanumeric characters."""
    return re.findall(r"[a-z0-9]+", text.lower())


def _ngrams(words: list[str], n: int) -> set[tuple]:
    if len(words) < n:
        return set()
    return {tuple(words[i:i + n]) for i in range(len(words) - n + 1)}


def compute_source_overlap(draft_text: str, source_chunks: list[str], n: int = DEFAULT_NGRAM_SIZE) -> dict:
    """
    Compares `draft_text` against the concatenation of `source_chunks` and
    returns:
      - overlap_ratio: fraction of the draft's n-grams that also occur
        verbatim among the source's n-grams (0.0 if the draft is too short
        to form any n-grams).
      - longest_verbatim_run: length (in words) of the longest run of
        consecutive draft words that appears verbatim, in order, in the
        source text.
      - near_copy_flag: True if overlap_ratio or longest_verbatim_run
        exceeds its warning threshold.
    """
    draft_words = _tokenize(draft_text)
    source_text = " ".join(source_chunks)
    source_words = _tokenize(source_text)

    draft_ngrams = _ngrams(draft_words, n)
    source_ngrams = _ngrams(source_words, n)

    if not draft_ngrams:
        overlap_ratio = 0.0
    else:
        overlap_count = sum(1 for g in draft_ngrams if g in source_ngrams)
        overlap_ratio = overlap_count / len(draft_ngrams)

    longest_verbatim_run = _longest_verbatim_run(draft_words, source_words)

    near_copy_flag = (
        overlap_ratio >= OVERLAP_RATIO_WARNING_THRESHOLD
        or longest_verbatim_run >= LONGEST_RUN_WARNING_THRESHOLD
    )

    return {
        "overlap_ratio": overlap_ratio,
        "longest_verbatim_run": longest_verbatim_run,
        "near_copy_flag": near_copy_flag,
    }


def _longest_verbatim_run(draft_words: list[str], source_words: list[str]) -> int:
    """
    Longest run of consecutive words in draft_words that appears as a
    contiguous subsequence, in the same order, somewhere in source_words.

    Uses the classic longest-common-substring DP over word sequences
    (O(len(draft) * len(source)) time, O(len(source)) space via a rolling
    row) rather than longest-common-*subsequence* -- we want a verbatim,
    consecutive run, not just words appearing in the same relative order.
    """
    if not draft_words or not source_words:
        return 0

    prev_row = [0] * (len(source_words) + 1)
    longest = 0

    for i in range(1, len(draft_words) + 1):
        curr_row = [0] * (len(source_words) + 1)
        for j in range(1, len(source_words) + 1):
            if draft_words[i - 1] == source_words[j - 1]:
                curr_row[j] = prev_row[j - 1] + 1
                if curr_row[j] > longest:
                    longest = curr_row[j]
        prev_row = curr_row

    return longest
