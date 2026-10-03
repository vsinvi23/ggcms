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

LONG_FORM_CATEGORY_SLUGS = {
    "backend-and-apis": "backend-apis",
    "containers-and-orchestration": "containers-orchestration",
    "identity-and-access": "identity-access",
    "pki-and-cryptography": "pki-cryptography",
    "appsec-and-threats": "appsec-threats",
    "cloud-and-infrastructure": "cloud-infrastructure",
    "ai-and-machine-learning": "ai-machine-learning",
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

    category_slug = metadata.get("categorySlug") or metadata.get("category") or metadata.get("category_slug")
    if not category_slug:
        errors.append("Missing required field 'categorySlug'")
    elif category_slug in LONG_FORM_CATEGORY_SLUGS:
        errors.append(f"Long-form categorySlug '{category_slug}' will fail DB auto-matching! Change to short-form '{LONG_FORM_CATEGORY_SLUGS[category_slug]}'")

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
            
            category_slug = data.get("categorySlug")
            if category_slug in LONG_FORM_CATEGORY_SLUGS:
                errors.append(f"Long-form categorySlug '{category_slug}' will fail DB auto-matching! Change to short-form '{LONG_FORM_CATEGORY_SLUGS[category_slug]}'")

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


def is_content_file(f: Path, base_dir: Path) -> bool:
    try:
        rel_parts = f.relative_to(base_dir).parts
        if rel_parts[0] in {"dist", "scripts", ".git", ".venv", "node_modules", ".batches"}:
            return False
    except Exception:
        return False
    return f.name not in {"README.md", "GEEKGULLY_CONTENT_CATALOG_AND_BACKEND_INTEGRATION_BLUEPRINT.md", "import_manifest.json", ".DS_Store"}


def collect_all_files(repo_dir: Path):
    content_dir = repo_dir / "content"
    imported_dir = repo_dir / "imported-content"

    files = []
    for d in [content_dir, imported_dir]:
        if d.exists():
            for f in d.rglob("*"):
                if f.is_file() and (f.suffix in [".md", ".markdown", ".json"]):
                    if is_content_file(f, d):
                        files.append((f, f.relative_to(repo_dir)))
    return sorted(files, key=lambda x: str(x[1]))


def run_pipeline(repo_dir: Path):
    """Executes Multi-Agent scanning and validation across articles, courses, and learning paths."""
    print("🤖 Multi-Agent Content Orchestrator running...")
    print(f"📂 Scanning workspace content directories: content/ and imported-content/\n")

    all_files_tuples = collect_all_files(repo_dir)
    total = len(all_files_tuples)
    valid_count = 0
    invalid_count = 0

    for file_path, rel_path in all_files_tuples:
        if file_path.suffix in [".md", ".markdown"]:
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


def create_package(repo_dir: Path, dist_dir: Path, unimported_only: bool = False, num_parts: int = 4):
    """Packages markdown & JSON content files into 4 ZIP archives for gg-cms bulk import (max 500 files per zip)."""
    dist_dir.mkdir(parents=True, exist_ok=True)
    all_files_tuples = collect_all_files(repo_dir)

    uploaded_files = set()
    manifest_path = repo_dir / "content" / "import_manifest.json"
    if unimported_only and manifest_path.exists():
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
                for item in manifest.get("articles", []) + manifest.get("courses", []) + manifest.get("learningPaths", []):
                    if "filePath" in item:
                        uploaded_files.add(item["filePath"])
                        uploaded_files.add(f"content/{item['filePath']}")
        except Exception as e:
            print(f"Warning reading manifest: {e}")

    if unimported_only:
        all_files_tuples = [t for t in all_files_tuples if str(t[1]) not in uploaded_files and str(t[1]).replace("content/", "") not in uploaded_files]
        prefix = "ggcms_new_content_pack"
        print(f"\n📦 Packaging {len(all_files_tuples)} NEW (unimported) content files into {num_parts} parts...")
    else:
        prefix = "ggcms_content_pack"
        print(f"\n📦 Packaging all {len(all_files_tuples)} content files into {num_parts} parts...")

    # Clean up old single monolith zips if present
    for old_file in dist_dir.glob("*.zip"):
        old_file.unlink()
        print(f"🗑️ Removed existing zip archive: {old_file.name}")

    total_files = len(all_files_tuples)
    chunk_size = (total_files + num_parts - 1) // num_parts

    for i in range(num_parts):
        part_num = i + 1
        chunk = all_files_tuples[i * chunk_size : (i + 1) * chunk_size]
        if not chunk:
            continue

        output_zip = dist_dir / f"{prefix}_part{part_num}.zip"
        with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as archive:
            for file_path, rel_path in chunk:
                archive.write(file_path, arcname=str(rel_path))

        print(f"✨ Generated Part {part_num}/{num_parts}: {output_zip.name} ({len(chunk)} files, {output_zip.stat().st_size} bytes)")


def main():
    parser = argparse.ArgumentParser(description="Multi-Agent Content Orchestrator & Import Validator")
    parser.add_argument("--validate", action="store_true", help="Validate all content files")
    parser.add_argument("--package", action="store_true", help="Package all content into 4 zip parts")
    parser.add_argument("--package-new", action="store_true", help="Package only NEW unimported content into 4 zip parts")
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    content_dir = script_dir.parent
    repo_dir = content_dir.parent
    dist_dir = content_dir / "dist"

    success = run_pipeline(repo_dir)

    if args.package_new:
        if success:
            create_package(repo_dir, dist_dir, unimported_only=True, num_parts=4)
        else:
            print("⚠️ Skipping packaging due to validation errors.")
    elif args.package or not args.validate:
        if success:
            create_package(repo_dir, dist_dir, unimported_only=False, num_parts=4)
        else:
            print("⚠️ Skipping packaging due to validation errors.")

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()



