from __future__ import annotations
import ipaddress
import socket
from urllib.parse import urlparse

from backend.models.domain import Project

_ALLOWED_SCHEMES = {"http", "https"}

# Minimal static list of well-known, high-trust reference domains used for
# the source-trust fast-track (auto-approving discovered sources from these
# domains instead of requiring manual review). This list is intentionally
# small and can grow over time as more trusted reference sources are
# identified.
_TRUSTED_DOMAINS = {
    "wikipedia.org",
    "docs.python.org",
}
_TRUSTED_SUFFIXES = (
    ".gov",
    ".edu",
)


def assert_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in _ALLOWED_SCHEMES:
        raise ValueError(f"disallowed URL scheme: {parsed.scheme!r}")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError(f"URL has no hostname: {url!r}")

    try:
        addr_infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise ValueError(f"could not resolve hostname: {hostname!r}") from exc

    for family, _, _, _, sockaddr in addr_infos:
        ip = ipaddress.ip_address(sockaddr[0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise ValueError(f"URL resolves to a disallowed address: {ip}")


def is_trusted_domain(url: str, project: Project | None = None) -> bool:
    """
    Returns True when `url`'s hostname is a well-known, high-trust reference
    domain (see _TRUSTED_DOMAINS/_TRUSTED_SUFFIXES above), or matches a
    project-specific allowlist entry, if one is configured.

    As of this change, `Project` (backend/models/domain.py) has no dedicated
    custom-allowlist field of its own -- the closest existing concept is
    `ProjectStrategy.preferred_sources`, which is a separate model callers
    would need to fetch and pass in themselves. To keep this function's
    signature simple (project, not project+strategy), we only consult
    `project` here: if a future revision adds a domain-allowlist field
    directly to `Project` (e.g. `custom_domain_allowlist`), it is picked up
    automatically via getattr below; until then this falls back to the
    static list.
    """
    hostname = urlparse(url).hostname
    if not hostname:
        return False
    hostname = hostname.lower()

    if any(
        hostname == domain or hostname.endswith(f".{domain}")
        for domain in _TRUSTED_DOMAINS
    ):
        return True

    if any(
        hostname == suffix.lstrip(".") or hostname.endswith(suffix)
        for suffix in _TRUSTED_SUFFIXES
    ):
        return True

    custom_allowlist = getattr(project, "custom_domain_allowlist", None) if project else None
    if custom_allowlist:
        for entry in custom_allowlist:
            entry = entry.lower().lstrip(".")
            if hostname == entry or hostname.endswith(f".{entry}"):
                return True

    return False
