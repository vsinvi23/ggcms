import asyncio
import logging
from urllib.parse import urljoin

import feedparser
import httpx
from bs4 import BeautifulSoup

from backend.ingestion.pipeline import ingest_discovered_source
from backend.models.base import utcnow
from backend.models.domain import Portal
from backend.services import dedup
from backend.storage import file_store
from backend.storage.file_store import ProjectId

logger = logging.getLogger(__name__)

# How often the background loop wakes to check whether any portal is due for
# a scan. Portal intervals are configured in minutes (default 360 = 6h), so a
# 1-minute check resolution is more than enough and cheap to run.
_LOOP_CHECK_SECONDS = 60


async def _fetch_text(url: str) -> str:
    async with httpx.AsyncClient(follow_redirects=True) as client:
        response = await client.get(url, timeout=30.0)
        response.raise_for_status()
        return response.text


async def discover_links(portal: Portal) -> list[dict]:
    """
    Returns candidate articles as [{"url", "title", "snippet"}], best-effort.
    Dedup against already-known Sources is the real correctness gate (done in
    scan_portal), not perfect extraction here.
    """
    if portal.portal_type == "rss":
        raw = await _fetch_text(portal.url)
        parsed = feedparser.parse(raw)
        return [
            {
                "url": entry.get("link"),
                "title": entry.get("title"),
                "snippet": entry.get("summary"),
            }
            for entry in parsed.entries
            if entry.get("link")
        ]

    # "listing": parse HTML links, optionally scoped by a CSS selector.
    html = await _fetch_text(portal.url)
    soup = BeautifulSoup(html, "html.parser")
    scope = soup.select(portal.link_selector) if portal.link_selector else [soup]

    candidates: list[dict] = []
    seen_urls: set[str] = set()
    for node in scope:
        for a in node.find_all("a", href=True):
            href = a["href"].strip()
            if not href or href.startswith("#") or href.startswith("javascript:"):
                continue
            absolute_url = urljoin(portal.url, href)
            if absolute_url in seen_urls:
                continue
            seen_urls.add(absolute_url)
            title = a.get_text(strip=True) or None
            candidates.append({"url": absolute_url, "title": title, "snippet": None})
    return candidates


async def scan_portal(project_id: ProjectId, portal: Portal) -> dict:
    """
    Discovers links on a portal, skips ones already known (dedup against
    existing Sources by canonical URL), and ingests the rest via
    ingest_discovered_source(discovery_method="portal_scrape"). Always
    updates the portal's last_scanned_at/last_scan_status/last_scan_new_count,
    even on failure, so a broken portal is visible in the UI rather than
    silently retried forever.
    """
    try:
        candidates = await discover_links(portal)
    except Exception as exc:  # noqa: BLE001 - a broken portal must not crash the caller
        logger.warning(f"portal scan failed for {portal.name} ({portal.url}): {exc}")
        portal.last_scanned_at = utcnow()
        portal.last_scan_status = "failed"
        portal.last_scan_new_count = None
        await file_store.update_portal(project_id, portal)
        return {"status": "failed", "portal_id": portal.id, "error": str(exc)}

    known_urls = set()
    for existing in file_store.list_sources(project_id):
        if existing.url:
            known_urls.add(existing.url)

    new_count = 0
    for i, candidate in enumerate(candidates):
        url = candidate["url"]
        if not url:
            continue
        canonical_url = dedup.canonicalize_url(url)
        if canonical_url in known_urls:
            continue
        known_urls.add(canonical_url)  # avoid re-attempting duplicates within the same scan

        try:
            result = await ingest_discovered_source(
                project_id,
                url=url,
                title=candidate.get("title"),
                snippet=candidate.get("snippet"),
                search_query=f"portal:{portal.name}",
                search_rank=i,
                source_type="url",
                discovery_method="portal_scrape",
            )
            if result["status"] == "ingested":
                new_count += 1
        except Exception as exc:  # noqa: BLE001 - one bad link must not abort the scan
            logger.warning(f"portal-scan ingest failed for {url}: {exc}")

    portal.last_scanned_at = utcnow()
    portal.last_scan_status = "success"
    portal.last_scan_new_count = new_count
    await file_store.update_portal(project_id, portal)
    return {"status": "success", "portal_id": portal.id, "new_count": new_count}


def _is_due(portal: Portal) -> bool:
    if not portal.is_active:
        return False
    if portal.last_scanned_at is None:
        return True
    elapsed = utcnow() - portal.last_scanned_at
    return elapsed.total_seconds() >= portal.scan_interval_minutes * 60


async def portal_scan_loop() -> None:
    """
    Long-lived background task (started once from api/main.py's startup
    event) that periodically scans every due, active portal across all
    projects. One failing portal is caught inside scan_portal and never
    aborts the loop.
    """
    while True:
        try:
            for project in file_store.list_projects():
                for portal in file_store.list_portals(project.id):
                    if _is_due(portal):
                        await scan_portal(project.id, portal)
        except Exception as exc:  # noqa: BLE001 - the loop itself must never die
            logger.warning(f"portal_scan_loop iteration failed: {exc}")
        await asyncio.sleep(_LOOP_CHECK_SECONDS)
