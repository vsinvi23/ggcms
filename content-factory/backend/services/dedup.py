import hashlib
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from backend.models.domain import Source
from backend.storage import file_store
from backend.storage.file_store import ProjectId

# Query params that don't change page identity -- stripped during canonicalization
# so `?utm_source=twitter` and no query string dedup to the same source.
_TRACKING_PARAM_PREFIXES = ("utm_",)
_TRACKING_PARAMS = {"fbclid", "gclid", "mc_cid", "mc_eid", "ref", "ref_src"}

_WHITESPACE_RE = re.compile(r"\s+")


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
