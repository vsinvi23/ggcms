"""
Unit tests for backend/services/dedup.py's three-tier dedup logic:
canonicalize_url -> content_hash -> fallback_key (plan §12: "Topic/Opportunity:
dedup ... reject, not duplicate row" -- this covers the Source-dedup tier the
function actually implements today) plus the Opportunity/topic-dedup and
cooldown helpers layered on top per plan §6.1/§17 Wave 2
(canonicalize_topic, find_duplicate_opportunity, is_in_cooldown,
compute_cooldown_until).
"""
from datetime import timedelta

from backend.models.base import utcnow
from backend.models.domain import Opportunity
from backend.services.dedup import (
    canonicalize_topic,
    canonicalize_url,
    compute_cooldown_until,
    content_hash,
    fallback_key,
    find_duplicate_opportunity,
    is_in_cooldown,
)
import uuid


# ---------------------------------------------------------------------------
# canonicalize_url
# ---------------------------------------------------------------------------

class TestCanonicalizeUrl:
    def test_identical_urls_produce_identical_canonical_form(self):
        url = "https://example.com/article/asyncio-guide"
        assert canonicalize_url(url) == canonicalize_url(url)

    def test_trailing_slash_is_stripped(self):
        assert canonicalize_url("https://example.com/article/") == canonicalize_url(
            "https://example.com/article"
        )

    def test_root_path_trailing_slash_is_preserved(self):
        # len(path) > 1 guard -- "/" alone must not become "".
        assert canonicalize_url("https://example.com/") == "https://example.com/"

    def test_scheme_and_host_are_lowercased(self):
        assert canonicalize_url("HTTPS://Example.COM/Article") == canonicalize_url(
            "https://example.com/Article"
        )

    def test_default_https_port_is_stripped(self):
        assert canonicalize_url("https://example.com:443/article") == canonicalize_url(
            "https://example.com/article"
        )

    def test_default_http_port_is_stripped(self):
        assert canonicalize_url("http://example.com:80/article") == canonicalize_url(
            "http://example.com/article"
        )

    def test_non_default_port_is_preserved(self):
        assert canonicalize_url("https://example.com:8443/article") != canonicalize_url(
            "https://example.com/article"
        )

    def test_fragment_is_dropped(self):
        assert canonicalize_url("https://example.com/article#section-2") == canonicalize_url(
            "https://example.com/article"
        )

    def test_utm_tracking_params_are_stripped(self):
        tracked = "https://example.com/article?utm_source=twitter&utm_medium=social"
        bare = "https://example.com/article"
        assert canonicalize_url(tracked) == canonicalize_url(bare)

    def test_named_tracking_params_are_stripped(self):
        tracked = "https://example.com/article?fbclid=abc123&gclid=xyz"
        bare = "https://example.com/article"
        assert canonicalize_url(tracked) == canonicalize_url(bare)

    def test_meaningful_query_params_are_preserved(self):
        assert canonicalize_url("https://example.com/search?q=asyncio") != canonicalize_url(
            "https://example.com/search"
        )

    def test_query_param_order_is_normalized(self):
        assert canonicalize_url("https://example.com/search?b=2&a=1") == canonicalize_url(
            "https://example.com/search?a=1&b=2"
        )

    def test_mixed_tracking_and_real_params_keeps_only_real_ones(self):
        tracked = "https://example.com/search?q=asyncio&utm_source=newsletter"
        bare = "https://example.com/search?q=asyncio"
        assert canonicalize_url(tracked) == canonicalize_url(bare)

    def test_different_paths_are_not_duplicates(self):
        assert canonicalize_url("https://example.com/article-one") != canonicalize_url(
            "https://example.com/article-two"
        )

    def test_scheme_defaults_to_https_when_missing(self):
        # urlsplit("example.com/article") has no scheme/netloc at all -- the
        # whole string is parsed as `path`, so scheme defaults to "https"
        # but netloc stays empty and urlunsplit does NOT insert "//" without
        # a netloc. This documents that current (surprising) behavior --
        # "https:example.com/article" -- rather than asserting an ideal
        # normalization this function doesn't actually implement.
        result = canonicalize_url("example.com/article")
        assert result == "https:example.com/article"

    def test_surrounding_whitespace_is_stripped(self):
        assert canonicalize_url("  https://example.com/article  ") == canonicalize_url(
            "https://example.com/article"
        )


# ---------------------------------------------------------------------------
# content_hash
# ---------------------------------------------------------------------------

class TestContentHash:
    def test_identical_text_produces_identical_hash(self):
        text = "Asyncio lets you run coroutines concurrently."
        assert content_hash(text) == content_hash(text)

    def test_different_text_produces_different_hash(self):
        assert content_hash("Article A body text.") != content_hash("Article B body text.")

    def test_whitespace_differences_are_normalized(self):
        a = "Asyncio   lets you\nrun coroutines   concurrently."
        b = "Asyncio lets you run coroutines concurrently."
        assert content_hash(a) == content_hash(b)

    def test_leading_trailing_whitespace_is_stripped(self):
        assert content_hash("  same content  ") == content_hash("same content")

    def test_bytes_input_is_hashed_directly_not_whitespace_normalized(self):
        # bytes path (e.g. a PDF's raw bytes) skips the whitespace-normalize
        # step entirely -- two byte strings that differ only in embedded
        # whitespace are NOT deduped, unlike the str path above.
        a = b"raw   pdf    bytes"
        b = b"raw pdf bytes"
        assert content_hash(a) != content_hash(b)

    def test_identical_bytes_produce_identical_hash(self):
        data = b"\x89PNG\r\n\x1a\nfake binary content"
        assert content_hash(data) == content_hash(data)

    def test_returns_sha256_hex_digest_length(self):
        assert len(content_hash("anything")) == 64


# ---------------------------------------------------------------------------
# fallback_key
# ---------------------------------------------------------------------------

class TestFallbackKey:
    def test_identical_title_source_date_produce_identical_key(self):
        key_a = fallback_key("Asyncio Guide", "Real Python", "2026-01-15")
        key_b = fallback_key("Asyncio Guide", "Real Python", "2026-01-15")
        assert key_a == key_b

    def test_different_title_produces_different_key(self):
        key_a = fallback_key("Asyncio Guide", "Real Python", "2026-01-15")
        key_b = fallback_key("Threading Guide", "Real Python", "2026-01-15")
        assert key_a != key_b

    def test_case_and_whitespace_insensitive_title(self):
        key_a = fallback_key("Asyncio Guide", "Real Python", "2026-01-15")
        key_b = fallback_key("  ASYNCIO   GUIDE  ", "Real Python", "2026-01-15")
        assert key_a == key_b

    def test_date_granularity_is_day_level(self):
        # published_at values differing only in time-of-day (first 10 chars
        # of str(published_at) is the date part) still dedup to the same key.
        key_a = fallback_key("Asyncio Guide", "Real Python", "2026-01-15T08:00:00")
        key_b = fallback_key("Asyncio Guide", "Real Python", "2026-01-15T23:59:59")
        assert key_a == key_b

    def test_none_published_at_does_not_raise(self):
        key = fallback_key("Asyncio Guide", "Real Python", None)
        assert isinstance(key, str) and len(key) == 64

    def test_none_title_and_source_do_not_raise(self):
        key = fallback_key(None, None, "2026-01-15")
        assert isinstance(key, str) and len(key) == 64

    def test_different_source_produces_different_key(self):
        key_a = fallback_key("Asyncio Guide", "Real Python", "2026-01-15")
        key_b = fallback_key("Asyncio Guide", "Some Other Blog", "2026-01-15")
        assert key_a != key_b


# ---------------------------------------------------------------------------
# canonicalize_topic
# ---------------------------------------------------------------------------

class TestCanonicalizeTopic:
    def test_identical_topics_produce_identical_canonical_form(self):
        topic = "Async Python Patterns"
        assert canonicalize_topic(topic) == canonicalize_topic(topic)

    def test_case_is_normalized(self):
        assert canonicalize_topic("Async Python") == canonicalize_topic("ASYNC PYTHON")

    def test_whitespace_is_collapsed(self):
        assert canonicalize_topic("Async   Python") == canonicalize_topic("Async Python")

    def test_surrounding_whitespace_is_stripped(self):
        assert canonicalize_topic("  Async Python  ") == canonicalize_topic("Async Python")

    def test_punctuation_is_stripped(self):
        assert canonicalize_topic("Async Python: A Guide!") == canonicalize_topic(
            "Async Python A Guide"
        )

    def test_common_filler_words_are_stripped(self):
        assert canonicalize_topic("A Guide to Async Python") == canonicalize_topic(
            "Async Python"
        )

    def test_different_topics_are_not_duplicates(self):
        assert canonicalize_topic("Async Python") != canonicalize_topic("Threading in Java")

    def test_all_stopword_topic_does_not_canonicalize_to_empty(self):
        # "The Guide" is entirely stopwords -- must not collapse to "".
        result = canonicalize_topic("The Guide")
        assert result != ""

    def test_never_raises_on_empty_string(self):
        assert canonicalize_topic("") == ""


# ---------------------------------------------------------------------------
# find_duplicate_opportunity / is_in_cooldown / compute_cooldown_until
# ---------------------------------------------------------------------------


def _make_opportunity(canonical_topic=None, cooldown_until=None, status="DISCOVERED") -> Opportunity:
    return Opportunity(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        topic="Some Topic",
        score=50.0,
        status=status,
        canonical_topic=canonical_topic,
        cooldown_until=cooldown_until,
    )


class TestFindDuplicateOpportunity:
    def test_matching_canonical_topic_is_found(self):
        existing = _make_opportunity(canonical_topic="async python")
        assert find_duplicate_opportunity([existing], "async python") is existing

    def test_no_match_returns_none(self):
        existing = _make_opportunity(canonical_topic="async python")
        assert find_duplicate_opportunity([existing], "threading java") is None

    def test_empty_canonical_topic_never_matches(self):
        existing = _make_opportunity(canonical_topic=None)
        assert find_duplicate_opportunity([existing], "") is None

    def test_empty_existing_list_returns_none(self):
        assert find_duplicate_opportunity([], "async python") is None


class TestIsInCooldown:
    def test_no_cooldown_set_is_not_in_cooldown(self):
        opportunity = _make_opportunity(cooldown_until=None)
        assert is_in_cooldown(opportunity) is False

    def test_future_cooldown_is_in_cooldown(self):
        opportunity = _make_opportunity(cooldown_until=utcnow() + timedelta(days=5))
        assert is_in_cooldown(opportunity) is True

    def test_past_cooldown_is_not_in_cooldown(self):
        opportunity = _make_opportunity(cooldown_until=utcnow() - timedelta(days=1))
        assert is_in_cooldown(opportunity) is False


class TestComputeCooldownUntil:
    def test_published_gets_a_cooldown_in_the_future(self):
        result = compute_cooldown_until("PUBLISHED")
        assert result > utcnow()

    def test_rejected_gets_a_shorter_cooldown_than_published(self):
        published = compute_cooldown_until("PUBLISHED", now=utcnow())
        rejected = compute_cooldown_until("REJECTED", now=utcnow())
        assert rejected < published

    def test_other_statuses_get_no_cooldown(self):
        assert compute_cooldown_until("DISCOVERED") is None
        assert compute_cooldown_until("APPROVED") is None
