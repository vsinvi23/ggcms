"""Canonical JSON export for content items.

Implements IMPLEMENTATION_SPECIFICATION.md section 9 ("Export Formats"):

* `build_canonical_json` builds the canonical JSON representation
  (`schema_version, content_id, content_type, title, slug, summary,
  audience, difficulty, objectives, sections, sources, seo, geo, quality,
  generated_at`) that is stored in `content_item.body_json` and used as the
  source of truth for both the Markdown export and the ggcms sync payload.
* `write_export_package` lays out an export run on local disk following the
  package layout from the spec:

    export/<run_id>/
        manifest.json
        articles/<content_id>.json
        articles/<content_id>.md
        research/<content_id>_evidence.json
        sources/<source_id>.json

* `upload_export_package` is a stub for the Cloud Storage upload step --
  intentionally unimplemented (see TODO below).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

from backend.exporters.markdown_exporter import render_markdown

CANONICAL_SCHEMA_VERSION = "2.0"


def _get(obj: Any, key: str, default: Any = None) -> Any:
    """Attribute/mapping-agnostic getter.

    `content_item` may be a SQLAlchemy `ContentItem` ORM instance (attribute
    access) or a plain dict (e.g. in tests / scripts). This lets
    `build_canonical_json` accept either without the caller needing to know
    which.
    """
    if isinstance(obj, Mapping):
        return obj.get(key, default)
    return getattr(obj, key, default)


def build_canonical_json(
    content_item: Any,
    *,
    schema_version: str = CANONICAL_SCHEMA_VERSION,
    generated_at: str | None = None,
) -> dict:
    """Build the canonical export JSON for a content item.

    `content_item` is expected to expose (via attribute or dict access):
      - id / content_id, content_type, title, slug
      - body_json: dict carrying the generated body -- summary/description,
        audience, difficulty, objectives, sections, sources, seo, geo,
        quality, generated_at. Any of these may also be present directly on
        `content_item` itself (checked as a fallback), which is convenient
        for constructing minimal fixtures in tests/scripts.

    Returns a plain, JSON-serializable dict matching SLAD section 5.8 /
    IMPLEMENTATION_SPECIFICATION.md section 9.
    """
    body: dict = _get(content_item, "body_json") or {}

    content_id = (
        _get(content_item, "content_id")
        or _get(content_item, "id")
        or body.get("content_id")
        or ""
    )

    def field(name: str, default: Any = None) -> Any:
        # Prefer an explicit value on content_item, then body_json, then default.
        value = _get(content_item, name)
        if value is None or value == "":
            value = body.get(name)
        if value is None:
            value = default
        return value

    canonical = {
        "schema_version": schema_version,
        "content_id": str(content_id),
        "content_type": field("content_type", ""),
        "title": field("title", ""),
        "slug": field("slug", ""),
        "summary": body.get("summary") or body.get("description") or "",
        "audience": field("audience", ""),
        "difficulty": field("difficulty", ""),
        "objectives": body.get("objectives", []) or [],
        "sections": body.get("sections", []) or [],
        "sources": body.get("sources", []) or [],
        "seo": body.get("seo", {}) or {},
        "geo": body.get("geo", {}) or {},
        "quality": body.get("quality", {}) or {},
        "generated_at": generated_at
        or body.get("generated_at")
        or datetime.now(timezone.utc).isoformat(),
    }

    # Fail loudly (not silently produce a broken payload) if this doesn't
    # round-trip through JSON -- e.g. a caller stuffed a datetime object or
    # a non-serializable type into body_json.
    json.dumps(canonical)
    return canonical


def write_export_package(
    run_id: str,
    canonical_items: list[dict],
    *,
    evidence_by_content_id: dict[str, dict] | None = None,
    sources_by_id: dict[str, dict] | None = None,
    base_dir: str | Path = "export",
) -> Path:
    """Write an export run to local disk using the spec's package layout.

    export/<run_id>/
        manifest.json
        articles/<content_id>.json
        articles/<content_id>.md
        research/<content_id>_evidence.json   (only if evidence provided)
        sources/<source_id>.json              (only if sources provided)

    Returns the path to the run directory (`base_dir/run_id`).
    """
    evidence_by_content_id = evidence_by_content_id or {}
    sources_by_id = sources_by_id or {}

    run_dir = Path(base_dir) / run_id
    articles_dir = run_dir / "articles"
    research_dir = run_dir / "research"
    sources_dir = run_dir / "sources"
    for d in (articles_dir, research_dir, sources_dir):
        d.mkdir(parents=True, exist_ok=True)

    manifest_items = []
    for canonical in canonical_items:
        content_id = canonical["content_id"]

        article_json_path = articles_dir / f"{content_id}.json"
        article_json_path.write_text(
            json.dumps(canonical, indent=2, ensure_ascii=False), encoding="utf-8"
        )

        article_md_path = articles_dir / f"{content_id}.md"
        article_md_path.write_text(render_markdown(canonical), encoding="utf-8")

        manifest_entry = {
            "content_id": content_id,
            "content_type": canonical.get("content_type"),
            "slug": canonical.get("slug"),
            "title": canonical.get("title"),
            "article_json": str(article_json_path.relative_to(run_dir).as_posix()),
            "article_md": str(article_md_path.relative_to(run_dir).as_posix()),
        }

        evidence = evidence_by_content_id.get(content_id)
        if evidence is not None:
            evidence_path = research_dir / f"{content_id}_evidence.json"
            evidence_path.write_text(
                json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8"
            )
            manifest_entry["research_evidence"] = str(
                evidence_path.relative_to(run_dir).as_posix()
            )

        manifest_items.append(manifest_entry)

    for source_id, source in sources_by_id.items():
        source_path = sources_dir / f"{source_id}.json"
        source_path.write_text(
            json.dumps(source, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    manifest = {
        "run_id": run_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "item_count": len(manifest_items),
        "items": manifest_items,
        "sources": sorted(sources_by_id.keys()),
    }
    (run_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    return run_dir


def upload_export_package(local_run_dir: str | Path, *, bucket: str | None = None) -> None:
    """Upload a local export package directory to Cloud Storage.

    NOT IMPLEMENTED. This is a stub so callers have a stable function
    signature to build against.

    TODO(export/gcs): implement upload of everything under `local_run_dir`
    to `gs://{bucket or settings.gcs_bucket}/export/<run_id>/...`, mirroring
    the local layout, using the google-cloud-storage client with
    application-default / workload-identity credentials (do NOT wire up
    real GCS auth here -- that belongs in a dedicated storage-integration
    task with its own credentials/testing setup).
    """
    raise NotImplementedError(
        "upload_export_package is a stub -- Cloud Storage upload is not yet "
        "implemented. See TODO(export/gcs) in backend/exporters/json_exporter.py."
    )
