#!/usr/bin/env python3
"""
Catalog SQL Migration Generator for GeekGully CMS.

Reads all validated articles, courses, and learning paths from `content/`
and generates PostgreSQL database migration 038_seed_catalog_content.sql.
Ensures every article and course listed in learning paths exists in both
articles and courses tables, and seeds learning_path_courses junction records.
"""

import os
import re
import json
import uuid
from pathlib import Path

CATEGORY_SLUG_MAP = {
    "backend-and-apis": "backend-apis",
    "containers-and-orchestration": "containers-orchestration",
    "identity-and-access": "identity-access",
    "pki-and-cryptography": "pki-cryptography",
    "appsec-and-threats": "appsec-threats",
    "cloud-and-infrastructure": "cloud-infrastructure",
    "ai-and-machine-learning": "ai-machine-learning"
}

def normalize_category_slug(slug):
    if not slug:
        return "software-engineering"
    slug = slug.strip().lower()
    return CATEGORY_SLUG_MAP.get(slug, slug)

def slugify(text):
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    return re.sub(r'[-\s]+', '-', text)

def escape_sql(text):
    if not text:
        return ''
    return text.replace("'", "''")

def parse_yaml_frontmatter(content):
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


def generate_sql():
    script_dir = Path(__file__).resolve().parent
    content_dir = script_dir.parent
    migration_file = content_dir.parent / "gg-cms" / "backend" / "go-cms" / "migrations" / "postgres" / "038_seed_catalog_content.sql"

    sql_statements = [
        "-- Migration 038: Seed Catalog Content (Articles, Courses & Learning Paths)",
        "-- Generated automatically from content/ repository\n"
    ]

    # Process Articles (.md files excluding courses)
    md_files = [f for f in content_dir.glob("**/*.md") if f.name not in {"README.md", "GEEKGULLY_CONTENT_CATALOG_AND_BACKEND_INTEGRATION_BLUEPRINT.md"} and "courses/" not in str(f)]
    
    sql_statements.append("-- 1. SEED ARTICLES")
    for file_path in sorted(md_files):
        content = file_path.read_text(encoding="utf-8")
        metadata, body = parse_yaml_frontmatter(content)
        title = escape_sql(metadata.get("title", file_path.stem))
        description = escape_sql(metadata.get("description", ""))
        raw_cat = metadata.get("categorySlug", "software-engineering")
        category_slug = escape_sql(normalize_category_slug(raw_cat))
        article_type = escape_sql(metadata.get("articleType", "GUIDE"))
        body_sql = escape_sql(body)
        slug = file_path.stem
        public_id = f"art-{uuid.uuid4().hex}"[:36]

        stmt = f"""
INSERT INTO articles (title, description, body, status, category_id, created_by_id, public_id, slug, published_at, article_type)
SELECT 
    '{title}',
    '{description}',
    '{body_sql}',
    'PUBLISHED',
    c.id,
    u.id,
    '{public_id}',
    '{slug}',
    NOW(),
    '{article_type}'
FROM users u 
CROSS JOIN categories c 
WHERE u.email = 'admin@gg-cms.local' AND (c.slug = '{category_slug}' OR c.slug = '{raw_cat}')
ON CONFLICT (public_id) DO NOTHING;
"""
        sql_statements.append(stmt)

        # Also register article as a course module entry so learning paths referencing it resolve cleanly
        course_pub_id = f"crs-{uuid.uuid4().hex}"[:36]
        course_stmt = f"""
INSERT INTO courses (title, description, status, category_id, created_by_id, public_id, slug, published_at, course_type)
SELECT 
    '{title}',
    '{description}',
    'PUBLISHED',
    c.id,
    u.id,
    '{course_pub_id}',
    '{slug}',
    NOW(),
    'MODULE'
FROM users u 
CROSS JOIN categories c 
WHERE u.email = 'admin@gg-cms.local' AND (c.slug = '{category_slug}' OR c.slug = '{raw_cat}')
ON CONFLICT (public_id) DO NOTHING;
"""
        sql_statements.append(course_stmt)

    # Process Dedicated Courses (.md and .json under courses/)
    sql_statements.append("\n-- 2. SEED DEDICATED COURSES")
    course_mds = list(content_dir.glob("courses/**/*.md"))
    course_jsons = list(content_dir.glob("courses/**/*.json"))

    for file_path in sorted(course_mds):
        content = file_path.read_text(encoding="utf-8")
        metadata, body = parse_yaml_frontmatter(content)
        title = escape_sql(metadata.get("title", file_path.stem))
        description = escape_sql(metadata.get("description", ""))
        raw_cat = metadata.get("categorySlug", "backend-apis")
        category_slug = escape_sql(normalize_category_slug(raw_cat))
        course_type = escape_sql(metadata.get("courseType", "TRACK"))
        slug = file_path.stem
        public_id = f"crs-{uuid.uuid4().hex}"[:36]

        stmt = f"""
INSERT INTO courses (title, description, status, category_id, created_by_id, public_id, slug, published_at, course_type)
SELECT 
    '{title}',
    '{description}',
    'PUBLISHED',
    c.id,
    u.id,
    '{public_id}',
    '{slug}',
    NOW(),
    '{course_type}'
FROM users u 
CROSS JOIN categories c 
WHERE u.email = 'admin@gg-cms.local' AND (c.slug = '{category_slug}' OR c.slug = '{raw_cat}')
ON CONFLICT (public_id) DO NOTHING;
"""
        sql_statements.append(stmt)

    for file_path in sorted(course_jsons):
        data = json.loads(file_path.read_text(encoding="utf-8"))
        title = escape_sql(data.get("title", file_path.stem))
        description = escape_sql(data.get("description", ""))
        raw_cat = data.get("categorySlug", "containers-orchestration")
        category_slug = escape_sql(normalize_category_slug(raw_cat))
        course_type = escape_sql(data.get("courseType", "TRACK"))
        slug = file_path.stem
        public_id = f"crs-{uuid.uuid4().hex}"[:36]

        stmt = f"""
INSERT INTO courses (title, description, status, category_id, created_by_id, public_id, slug, published_at, course_type)
SELECT 
    '{title}',
    '{description}',
    'PUBLISHED',
    c.id,
    u.id,
    '{public_id}',
    '{slug}',
    NOW(),
    '{course_type}'
FROM users u 
CROSS JOIN categories c 
WHERE u.email = 'admin@gg-cms.local' AND (c.slug = '{category_slug}' OR c.slug = '{raw_cat}')
ON CONFLICT (public_id) DO NOTHING;
"""
        sql_statements.append(stmt)

    # Process Learning Paths (.json under learning-paths/) and Junction Records
    sql_statements.append("\n-- 3. SEED LEARNING PATHS & JUNCTION COURSES")
    path_jsons = list(content_dir.glob("learning-paths/**/*.json"))

    for file_path in sorted(path_jsons):
        data = json.loads(file_path.read_text(encoding="utf-8"))
        kind = escape_sql(data.get("kind", "DevOps Engineer"))
        title = escape_sql(data.get("title", file_path.stem))
        description = escape_sql(data.get("description", ""))

        stmt = f"""
INSERT INTO learning_paths (kind, title, description, created_by_id)
SELECT 
    '{kind}',
    '{title}',
    '{description}',
    u.id
FROM users u WHERE u.email = 'admin@gg-cms.local'
ON CONFLICT DO NOTHING;
"""
        sql_statements.append(stmt)

        # Seed learning_path_courses junction table records
        sequenced_courses = data.get("sequencedCourses", [])
        for item in sequenced_courses:
            seq_order = item.get("sequenceOrder", 1)
            c_slug = escape_sql(item.get("courseSlug", ""))
            if not c_slug:
                continue

            junc_stmt = f"""
INSERT INTO learning_path_courses (learning_path_id, course_id, sort_order)
SELECT lp.id, crs.id, {seq_order}
FROM learning_paths lp
CROSS JOIN courses crs
WHERE lp.title = '{title}' AND crs.slug = '{c_slug}'
ON CONFLICT DO NOTHING;
"""
            sql_statements.append(junc_stmt)

    # Write migration file
    migration_file.parent.mkdir(parents=True, exist_ok=True)
    migration_file.write_text("\n".join(sql_statements), encoding="utf-8")
    print(f"✨ Successfully generated migration 038 at: {migration_file}")

if __name__ == "__main__":
    generate_sql()
