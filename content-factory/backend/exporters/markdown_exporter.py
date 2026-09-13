"""Render the canonical export JSON (see json_exporter.build_canonical_json)
into Markdown with YAML frontmatter, per IMPLEMENTATION_SPECIFICATION.md
section 9: "Markdown -- generated from the JSON via
exporters/markdown_exporter.py; must include title, metadata frontmatter,
summary, body, references/sources."
"""
from __future__ import annotations

from typing import Any

import yaml


def _section_heading(section: dict, level: int = 2) -> str:
    title = section.get("title") or ""
    return f"{'#' * level} {title}".rstrip()


def _section_body(section: dict) -> str:
    # Canonical sections aren't rigidly typed (unlike ArticleSection in the
    # ggcms sync contract) -- accept whichever content key is present.
    for key in ("markdown", "content", "body", "markdown_body", "text"):
        value = section.get(key)
        if value:
            return str(value)
    return ""


def _render_sections(sections: list[dict]) -> str:
    blocks = []
    for section in sections:
        heading = _section_heading(section)
        body = _section_body(section)
        block = "\n\n".join(part for part in (heading, body) if part)
        if block:
            blocks.append(block)
    return "\n\n".join(blocks)


def _render_sources(sources: list[Any]) -> str:
    if not sources:
        return ""
    lines = ["## References & Sources", ""]
    for source in sources:
        if isinstance(source, dict):
            label = source.get("title") or source.get("name") or source.get("url") or str(source)
            url = source.get("url")
            if url and url != label:
                lines.append(f"- [{label}]({url})")
            else:
                lines.append(f"- {label}")
        else:
            lines.append(f"- {source}")
    return "\n".join(lines)


def build_frontmatter(canonical: dict) -> dict:
    """Build the YAML frontmatter metadata block for a canonical item."""
    return {
        "title": canonical.get("title", ""),
        "slug": canonical.get("slug", ""),
        "content_type": canonical.get("content_type", ""),
        "audience": canonical.get("audience", ""),
        "difficulty": canonical.get("difficulty", ""),
        "objectives": canonical.get("objectives", []) or [],
        "generated_at": canonical.get("generated_at", ""),
        "quality": canonical.get("quality", {}) or {},
        "schema_version": canonical.get("schema_version", ""),
        "content_id": canonical.get("content_id", ""),
    }


def render_markdown(canonical: dict) -> str:
    """Render a canonical export JSON dict (see
    `json_exporter.build_canonical_json`) into a Markdown document with
    YAML frontmatter, a title, the summary, the rendered body sections, and
    a trailing references/sources section.
    """
    frontmatter = build_frontmatter(canonical)
    frontmatter_yaml = yaml.safe_dump(
        frontmatter, sort_keys=False, allow_unicode=True, default_flow_style=False
    ).rstrip("\n")

    title = canonical.get("title", "")
    summary = canonical.get("summary", "")
    sections_md = _render_sections(canonical.get("sections", []) or [])
    sources_md = _render_sources(canonical.get("sources", []) or [])

    parts = [f"---\n{frontmatter_yaml}\n---", f"# {title}"]
    if summary:
        parts.append(summary)
    if sections_md:
        parts.append(sections_md)
    if sources_md:
        parts.append(sources_md)

    return "\n\n".join(parts) + "\n"
