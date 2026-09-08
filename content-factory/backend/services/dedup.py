import hashlib
import re
from datetime import datetime, timedelta
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from backend.models.base import utcnow
from backend.models.domain import Opportunity, Source
from backend.storage import file_store
from backend.storage.file_store import ProjectId

# Query params that don't change page identity -- stripped during canonicalization
# so `?utm_source=twitter` and no query string dedup to the same source.
_TRACKING_PARAM_PREFIXES = ("utm_",)
_TRACKING_PARAMS = {"fbclid", "gclid", "mc_cid", "mc_eid", "ref", "ref_src"}

_WHITESPACE_RE = re.compile(r"\s+")

# Small set of filler words that don't change topic identity for dedup
# purposes (e.g. "Guide to Async Python" and "The Async Python Guide" should
# collide). Deliberately tiny/conservative -- over-stripping risks merging
# genuinely distinct topics.
_TOPIC_STOPWORDS = {
    "a", "an", "the", "to", "of", "for", "and", "or", "with", "in", "on",
    "how", "what", "why", "guide", "introduction", "intro",
}
_NON_ALNUM_RE = re.compile(r"[^a-z0-9\s]")

# Cooldown durations applied once an Opportunity reaches a terminal-ish
# status, so the same (canonical) topic isn't immediately re-discovered.
# Per plan §4 ("Topic dedup/cooldown logic layered onto Opportunity") --
# not settings-driven (would need a new backend/configs/settings.py field,
# outside this workstream's touched-file set), so these are sane hardcoded
# constants instead.
COOLDOWN_DAYS_REJECTED = 7
COOLDOWN_DAYS_PUBLISHED = 30


def canonicalize_url(url: str) -> str:
    """
    Normalizes a URL for dedup comparison: lowercases scheme/host, strips the
    default port, drops the fragment, removes tracking query params, sorts the
    remaining query params, and strips a trailing slash from the path.
    """
    parts = urlsplit(url.strip())
    scheme = (parts.scheme or "https").lower()
    netloc = parts.netloc.lower()

    # Strip default ports (":80" for http, ":443" for https).
    default_port = {"http": ":80", "https": ":443"}.get(scheme)
    if default_port and netloc.endswith(default_port):
        netloc = netloc[: -len(default_port)]

    path = parts.path or "/"
    if len(path) > 1 and path.endswith("/"):
        path = path.rstrip("/")

    kept_params = [
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if k.lower() not in _TRACKING_PARAMS
        and not any(k.lower().startswith(p) for p in _TRACKING_PARAM_PREFIXES)
    ]
    kept_params.sort()
    query = urlencode(kept_params)

    return urlunsplit((scheme, netloc, path, query, ""))  # fragment dropped


def content_hash(content: str | bytes) -> str:
    """
    SHA-256 hex digest of fetched/normalized content, used as the second link in the
    dedup chain (after canonical URL matching). Accepts either raw fetched bytes
    (e.g. a PDF's bytes) or text (whitespace-normalized before hashing so trivial
    formatting differences don't defeat the match).
    """
    if isinstance(content, bytes):
        data = content
    else:
        data = _WHITESPACE_RE.sub(" ", content).strip().encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def fallback_key(title: str | None, source_name: str | None, published_at) -> str:
    """
    Builds a stable fallback dedup key from title + source + date, for cases where
    neither URL nor exact content hash is a reliable match (e.g. syndicated content
    republished with minor edits). Per spec §7 dedup chain: canonical URL -> content
    hash -> this fallback.
    """
    normalized_title = _WHITESPACE_RE.sub(" ", (title or "").strip().lower())
    normalized_source = _WHITESPACE_RE.sub(" ", (source_name or "").strip().lower())
    date_part = ""
    if published_at is not None:
        # Accept both datetime objects and pre-formatted strings; day granularity only.
        date_part = str(published_at)[:10]
    return hashlib.sha256(
        f"{normalized_title}|{normalized_source}|{date_part}".encode("utf-8")
    ).hexdigest()


def find_duplicate_source(
    project_id: ProjectId, content_hash_value: str
) -> Source | None:
    """
    Looks up an existing Source with the same (project_id, content_hash) --
    the uniqueness the old DB constraint enforced for dedup, now checked via
    file_store.find_source_by_content_hash (STAGE 1) since there is no DB to
    enforce it anymore. Returns the Source if found, else None. Callers
    should short-circuit fetch/extract when this returns non-None (per spec
    §7: "duplicate ... is short-circuited before fetch").
    """
    return file_store.find_source_by_content_hash(project_id, content_hash_value)


# ---------------------------------------------------------------------------
# Topic/Opportunity dedup (Autonomous Content Factory plan §6.1/§17 Wave 2)
# ---------------------------------------------------------------------------
#
# Mirrors the Source-dedup pattern above (canonicalize -> compare -> find),
# but scoped to Opportunity topics instead of ingested content. There is no
# separate "content_hash" tier here -- a topic is just its own text, so the
# chain collapses to a single canonicalization step.


def canonicalize_topic(topic: str) -> str:
    """
    Normalizes a topic string for dedup comparison: lowercases, strips
    punctuation, collapses whitespace, and drops a small set of filler
    stopwords that don't change topic identity (e.g. "a", "the", "guide").
    This is the value stored on `Opportunity.canonical_topic`.

    Deliberately simple/deterministic (no stemming, no fuzzy matching) --
    matching canonicalize_url's style of "normalize the obvious noise, don't
    try to be clever." Two topics that differ only in filler words, case, or
    punctuation canonicalize to the same key; genuinely different topics
    (even close synonyms) do not.
    """
    lowered = _NON_ALNUM_RE.sub(" ", topic.strip().lower())
    words = [w for w in lowered.split() if w not in _TOPIC_STOPWORDS]
    canonical = " ".join(words)
    # If stopword-stripping ate the entire topic (e.g. topic == "The Guide"),
    # fall back to the un-stripped normalized form so we never canonicalize
    # a non-empty topic down to "".
    if not canonical:
        canonical = _WHITESPACE_RE.sub(" ", lowered).strip()
    return canonical


def is_in_cooldown(opportunity: Opportunity, now: datetime | None = None) -> bool:
    """
    True if `opportunity.cooldown_until` is set and still in the future --
    i.e. this topic should be skipped/deprioritized by discovery rather than
    re-surfaced. Mirrors the "short-circuit before fetch" pattern of
    find_duplicate_source: callers check this before creating a new
    Opportunity for a topic that recently reached a terminal state.
    """
    if opportunity.cooldown_until is None:
        return False
    now = now or utcnow()
    cooldown_until = opportunity.cooldown_until
    # Tolerate a naive datetime slipping in from YAML round-tripping --
    # compare on naive terms rather than raising on tz-aware/naive mismatch.
    if cooldown_until.tzinfo is None:
        now = now.replace(tzinfo=None)
    return cooldown_until > now


def compute_cooldown_until(status: str, now: datetime | None = None) -> datetime | None:
    """
    Returns the `cooldown_until` timestamp to stamp on an Opportunity when it
    moves to a terminal-ish status, or None if that status doesn't trigger a
    cooldown. PUBLISHED gets the longer cooldown (successfully published --
    avoid re-covering the same ground for a while); REJECTED gets a shorter
    one (topic wasn't wanted now, but circumstances -- trends, sub-scores --
    may change sooner than a published article goes stale).
    """
    now = now or utcnow()
    if status == "PUBLISHED":
        return now + timedelta(days=COOLDOWN_DAYS_PUBLISHED)
    if status == "REJECTED":
        return now + timedelta(days=COOLDOWN_DAYS_REJECTED)
    return None


def find_duplicate_opportunity(
    existing: list[Opportunity], canonical_topic: str
) -> Opportunity | None:
    """
    Looks up an existing Opportunity in `existing` (typically
    file_store.list_opportunities(project_id) for the same project) whose
    `canonical_topic` matches. Mirrors find_duplicate_source's shape:
    pure lookup, no side effects, no cooldown check baked in (cooldown is a
    separate concern -- see is_in_cooldown -- so callers can distinguish
    "duplicate, and still cooling down" from "duplicate, but cooldown has
    lapsed and it's fair game to re-evaluate"). Returns the first match, or
    None. An empty/falsy `canonical_topic` never matches anything, to avoid
    every not-yet-canonicalized legacy row (canonical_topic=None) colliding
    with each other.
    """
    if not canonical_topic:
        return None
    for opportunity in existing:
        if opportunity.canonical_topic == canonical_topic:
            return opportunity
    return None
