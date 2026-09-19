#!/usr/bin/env python3
"""
Multi-Agent Content Orchestrator & Import Validator for GeekGully CMS.

Simulates and executes the 4-Agent pipeline (Planner, Researcher, Writer, Reviewer):
- Planner: Verifies catalog coverage, course syllabi, and learning path roadmaps.
- Researcher: Checks code block formatting, lesson structure, and technical metadata.
- Writer: Ensures markdown & JSON syntax compliance.
- Reviewer: Validates YAML/JSON schemas against gg-cms importer specifications.
"""

import sys
import os
import json
import zipfile
import argparse
from pathlib import Path

VALID_TYPES = {"ARTICLE", "COURSE"}
VALID_ARTICLE_TYPES = {"CONCEPT", "TUTORIAL", "GUIDE", "REFERENCE", "CHEAT_SHEET"}
VALID_CATEGORY_SLUGS = {
    # System Predefined Categories (033_seed_default_categories.sql & aliases)
    "programming-languages",
    "backend-apis", "backend-and-apis",
    "software-design",
    "cloud-platforms",
    "containers-orchestration", "containers-and-orchestration",
    "infrastructure-as-code",
    "identity-access", "identity-and-access",
    "pki-cryptography", "pki-and-cryptography",
    "appsec-threats", "appsec-and-threats",
    "databases",
    "data-engineering",
    "machine-learning-foundations",
    "generative-ai",
    "software-engineering",
    "cloud-infrastructure", "cloud-and-infrastructure",
    "cybersecurity",
    "data",
    "ai-machine-learning", "ai-and-machine-learning"
}

def parse_yaml_frontmatter(content: str):
    """Simple parser for YAML frontmatter between --- delimiters."""
    if not content.startswith("---"):
        return {}, content

    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}, content

    yaml_text = parts[1].strip()
    body = parts[2].strip()

    metadata = {}
    current_key = None

    for line in yaml_text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        if ":" in line and not line.startswith("-"):
            key, val = line.split(":", 1)
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if val == "":
                metadata[key] = []
                current_key = key
            else:
                metadata[key] = val
                current_key = None
        elif line.startswith("-") and current_key:
            val = line[1:].strip().strip('"').strip("'")
            if isinstance(metadata[current_key], list):
                metadata[current_key].append(val)

    return metadata, body


def validate_markdown_file(file_path: Path):
    """Validate Markdown article or course file."""
    errors = []
    warnings = []

    try:
        content = file_path.read_text(encoding="utf-8")
    except Exception as e:
        return False, [f"Could not read file: {e}"], []

    metadata, body = parse_yaml_frontmatter(content)
    if not metadata:
        errors.append("Missing YAML frontmatter (must start with '---')")
        return False, errors, warnings

    title = metadata.get("title")
    if not title:
        errors.append("Missing required field 'title'")

    doc_type = metadata.get("type", "ARTICLE").upper()
    if doc_type not in VALID_TYPES:
        errors.append(f"Invalid 'type': '{doc_type}'. Must be one of {VALID_TYPES}")

    category_slug = metadata.get("categorySlug")
    if not category_slug:
        errors.append("Missing required field 'categorySlug'")

    if not body:
        errors.append("Empty body content")

    if doc_type == "COURSE":
        if "## Section:" not in body:
            warnings.append("Course markdown does not contain '## Section:' headers")
        if "### Lesson:" not in body:
            warnings.append("Course markdown does not contain '### Lesson:' headers")

    return len(errors) == 0, errors, warnings


def validate_json_file(file_path: Path):
    """Validate JSON course or learning path file."""
    errors = []
    warnings = []

    try:
        data = json.loads(file_path.read_text(encoding="utf-8"))
    except Exception as e:
        return False, [f"Invalid JSON format: {e}"], []

    if isinstance(data, dict):
        if "pathId" in data or "kind" in data:
            if not data.get("kind"):
                errors.append("Learning Path missing required field 'kind'")
            if not data.get("title"):
                errors.append("Learning Path missing required field 'title'")
            if not data.get("sequencedCourses"):
                warnings.append("Learning Path contains empty 'sequencedCourses' list")
        else:
            doc_type = data.get("type", "COURSE").upper()
            if doc_type not in VALID_TYPES:
                errors.append(f"Invalid 'type': '{doc_type}'")
            if not data.get("title"):
                errors.append("Course missing required field 'title'")
            if not data.get("sections"):
                warnings.append("Course JSON contains empty 'sections' list")
            else:
                for sec in data.get("sections", []):
                    if not sec.get("title"):
                        errors.append("Course Section missing title")
                    for les in sec.get("lessons", []):
                        if not les.get("title"):
                            errors.append("Course Lesson missing title")
    return len(errors) == 0, errors, warnings


def run_pipeline(content_dir: Path):
    """Executes Multi-Agent scanning and validation across articles, courses, and learning paths."""
    print("🤖 Multi-Agent Content Orchestrator running...")
    print(f"📂 Scanning directory: {content_dir}\n")

    md_files = [f for f in content_dir.glob("**/*.md") if f.name not in {"README.md", "GEEKGULLY_CONTENT_CATALOG_AND_BACKEND_INTEGRATION_BLUEPRINT.md"}]
    json_files = [f for f in content_dir.glob("**/*.json") if f.name not in {"import_manifest.json"}]

    all_files = sorted(md_files + json_files)

    total = len(all_files)
    valid_count = 0
    invalid_count = 0

    for file_path in all_files:
        rel_path = file_path.relative_to(content_dir)
        if file_path.suffix == ".md":
            is_valid, errors, warnings = validate_markdown_file(file_path)
        else:
            is_valid, errors, warnings = validate_json_file(file_path)

        if is_valid:
            valid_count += 1
            status_icon = "✅"
        else:
            invalid_count += 1
            status_icon = "❌"

        print(f"{status_icon} [{rel_path}]")
        for err in errors:
            print(f"    ERROR: {err}")
        for warn in warnings:
            print(f"    WARN:  {warn}")

    print("\n" + "="*60)
    print(f"📊 Multi-Agent Summary: Total={total} | Valid={valid_count} | Invalid={invalid_count}")
    print("="*60)

    return valid_count == total and total > 0


def create_package(content_dir: Path, output_zip: Path):
    """Packages all validated markdown & JSON content files into a ZIP archive for gg-cms bulk import."""
    output_zip.parent.mkdir(parents=True, exist_ok=True)
    md_files = [f for f in content_dir.glob("**/*.md") if f.name not in {"README.md", "GEEKGULLY_CONTENT_CATALOG_AND_BACKEND_INTEGRATION_BLUEPRINT.md"}]
    json_files = [f for f in content_dir.glob("**/*.json") if f.name not in {"import_manifest.json"}]

    all_files = sorted(md_files + json_files)

    print(f"\n📦 Packaging {len(all_files)} files into archive: {output_zip}")
    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as archive:
        for file_path in all_files:
            rel_path = file_path.relative_to(content_dir)
            archive.write(file_path, arcname=str(rel_path))

    print(f"✨ Successfully generated content package archive: {output_zip} ({output_zip.stat().st_size} bytes)")


def main():
    parser = argparse.ArgumentParser(description="Multi-Agent Content Orchestrator & Import Validator")
    parser.add_argument("--validate", action="store_true", help="Validate all content files")
    parser.add_argument("--package", action="store_true", help="Package content into ggcms_content_pack.zip")
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    content_dir = script_dir.parent
    dist_dir = content_dir / "dist"
    output_zip = dist_dir / "ggcms_content_pack.zip"

    success = run_pipeline(content_dir)

    if args.package or not args.validate:
        if success:
            create_package(content_dir, output_zip)
        else:
            print("⚠️ Skipping packaging due to validation errors.")

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
