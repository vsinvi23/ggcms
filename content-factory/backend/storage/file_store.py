"""
File-based YAML storage layer -- replaces the SQLAlchemy/Postgres layer for
STAGE 1 of the file-storage rewrite. This is a single-operator utility app
with no real concurrency, so there is no DB, no connection pool, and no
transactions: every entity is a YAML file (or a list inside one) under
`settings.data_dir`, and safety comes from (a) atomic file replacement and
(b) one `asyncio.Lock` per project directory guarding read-modify-write
sequences.

Directory layout (relative to `settings.data_dir`, default "./data"):

    data/
      settings.yaml                  <- AppSetting (global, not project-scoped)
      <project_id>/
        project.yaml                 <- {"project": Project, "strategy": ProjectStrategy | None}
        sources.yaml                 <- list[Source]
        opportunities.yaml           <- list[Opportunity]
        jobs.yaml                    <- list[GenerationJob]
        exports.yaml                 <- list[ExportPackage]
        knowledge.yaml               <- {"documents": [...], "chunks": [...], "packs": [...]}
        content/
          <content_id>.yaml          <- {"item": ContentItem, "versions": [ContentVersion],
                                          "quality_reports": [QualityReport]}

Design notes for later stages:

  * Every accessor takes `project_id` as its first argument (except the
    global settings functions) and resolves it to `<data_dir>/<project_id>/...`
    -- callers never build paths themselves.
  * Pure reads (list_*/get_*) are synchronous, unlocked functions -- for a
    single-operator app with no writers racing a reader mid-file, a plain
    `open()`+`yaml.safe_load()` is enough. They are cheap enough to call
    freely; there is no in-memory cache to invalidate.
  * Anything that reads-modifies-writes (append_*/update_*/save_*/delete_*)
    is `async def`, takes the per-project `asyncio.Lock` for the whole
    read-modify-write span, and writes atomically (temp file in the same
    directory + `os.replace`) so a crash mid-write never leaves a partial
    file behind.
  * `save_*` functions for single-object files (project, strategy, a content
    item, a knowledge document/pack) are upserts: they overwrite whatever is
    there. `save_job`/`save_export_package` upsert *into a list* (update the
    matching id if present, else append) so callers don't need separate
    create/update entry points.
  * IDs round-trip as `uuid.UUID` and timestamps as `datetime` in memory;
    `Model.model_dump(mode="json")` / `Model.model_validate(...)` handle the
    ISO-string <-> native-type conversion on the YAML boundary, so callers
    never see raw strings.
"""
import asyncio
import os
import tempfile
import uuid
from pathlib import Path
from typing import Optional

import yaml

from backend.configs.settings import settings as _config
from backend.models.domain import (
    AppSetting,
    ContentItem,
    ContentVersion,
    ExportPackage,
    GenerationJob,
    KnowledgeChunk,
    KnowledgeDocument,
    KnowledgePack,
    Opportunity,
    Portal,
    Project,
    ProjectStrategy,
    QualityReport,
    Source,
)

ProjectId = uuid.UUID | str

# ---------------------------------------------------------------------------
# filenames
# ---------------------------------------------------------------------------

_PROJECT_FILE = "project.yaml"
_SOURCES_FILE = "sources.yaml"
_PORTALS_FILE = "portals.yaml"
_OPPORTUNITIES_FILE = "opportunities.yaml"
_JOBS_FILE = "jobs.yaml"
_EXPORTS_FILE = "exports.yaml"
_KNOWLEDGE_FILE = "knowledge.yaml"
_CONTENT_DIR = "content"
_SETTINGS_FILE = "settings.yaml"  # top-level, sibling of the per-project dirs


# ---------------------------------------------------------------------------
# low-level path / read / atomic-write helpers
# ---------------------------------------------------------------------------

def _data_dir() -> Path:
    return Path(_config.data_dir)


def _project_dir(project_id: ProjectId) -> Path:
    return _data_dir() / str(project_id)


def _project_file(project_id: ProjectId, filename: str) -> Path:
    return _project_dir(project_id) / filename


def _content_file(project_id: ProjectId, content_id: ProjectId) -> Path:
    return _project_dir(project_id) / _CONTENT_DIR / f"{content_id}.yaml"


def _read_yaml(path: Path):
    """Returns the parsed YAML document, or None if the file doesn't exist yet."""
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _atomic_write_yaml(path: Path, data) -> None:
    """
    Writes `data` as YAML to `path` atomically: dump to a temp file in the
    same directory, then `os.replace` it over the destination. This avoids
    ever leaving a truncated/partial file behind if the process dies
    mid-write (os.replace is atomic on both POSIX and Windows).
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        dir=str(path.parent), prefix=f".{path.name}.", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True, default_flow_style=False)
        os.replace(tmp_path, path)
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


# ---------------------------------------------------------------------------
# per-project locks
# ---------------------------------------------------------------------------

_project_locks: dict[str, asyncio.Lock] = {}
_settings_lock = asyncio.Lock()


def _lock_for(project_id: ProjectId) -> asyncio.Lock:
    """
    Returns the module-level asyncio.Lock for this project, creating it on
    first use. Safe without extra synchronization: dict.get/setdefault here
    runs synchronously with no `await` in between, so there's no window for
    two coroutines to race and create two different Lock objects for the
    same project on a single-threaded event loop.
    """
    key = str(project_id)
    return _project_locks.setdefault(key, asyncio.Lock())


# ---------------------------------------------------------------------------
# project / project_strategy
# ---------------------------------------------------------------------------

def list_projects() -> list[Project]:
    """Scans every `<data_dir>/*/project.yaml`, newest first by created_at."""
    data_dir = _data_dir()
    if not data_dir.exists():
        return []
    projects: list[Project] = []
    for child in data_dir.iterdir():
        if not child.is_dir():
            continue
        raw = _read_yaml(child / _PROJECT_FILE)
        if raw and raw.get("project"):
            projects.append(Project.model_validate(raw["project"]))
    projects.sort(key=lambda p: p.created_at, reverse=True)
    return projects


def load_project(project_id: ProjectId) -> Optional[Project]:
    raw = _read_yaml(_project_file(project_id, _PROJECT_FILE))
    if not raw or not raw.get("project"):
        return None
    return Project.model_validate(raw["project"])


async def save_project(project: Project) -> Project:
    """Upsert: overwrites the `project` half of project.yaml, preserving `strategy`."""
    async with _lock_for(project.id):
        path = _project_file(project.id, _PROJECT_FILE)
        raw = _read_yaml(path) or {}
        raw["project"] = project.model_dump(mode="json")
        _atomic_write_yaml(path, raw)
    return project


def load_project_strategy(project_id: ProjectId) -> Optional[ProjectStrategy]:
    raw = _read_yaml(_project_file(project_id, _PROJECT_FILE))
    if not raw or not raw.get("strategy"):
        return None
    return ProjectStrategy.model_validate(raw["strategy"])


async def save_project_strategy(strategy: ProjectStrategy) -> ProjectStrategy:
    """Upsert: overwrites the `strategy` half of project.yaml, preserving `project`."""
    async with _lock_for(strategy.project_id):
        path = _project_file(strategy.project_id, _PROJECT_FILE)
        raw = _read_yaml(path) or {}
        raw["strategy"] = strategy.model_dump(mode="json")
        _atomic_write_yaml(path, raw)
    return strategy


# ---------------------------------------------------------------------------
# sources
# ---------------------------------------------------------------------------

def list_sources(project_id: ProjectId) -> list[Source]:
    raw = _read_yaml(_project_file(project_id, _SOURCES_FILE)) or []
    return [Source.model_validate(s) for s in raw]


def get_source(project_id: ProjectId, source_id: ProjectId) -> Optional[Source]:
    for s in list_sources(project_id):
        if str(s.id) == str(source_id):
            return s
    return None


def find_source_by_content_hash(project_id: ProjectId, content_hash: str) -> Optional[Source]:
    """
    Replaces the old (project_id, content_hash) DB unique constraint for
    dedup lookups (see backend/services/dedup.find_duplicate_source, a
    later-stage caller) -- there's no DB to enforce uniqueness anymore, so
    callers that care must check this themselves before append_source.
    """
    for s in list_sources(project_id):
        if s.content_hash == content_hash:
            return s
    return None


async def append_source(project_id: ProjectId, source: Source) -> Source:
    async with _lock_for(project_id):
        path = _project_file(project_id, _SOURCES_FILE)
        raw = _read_yaml(path) or []
        raw.append(source.model_dump(mode="json"))
        _atomic_write_yaml(path, raw)
    return source


async def update_source(project_id: ProjectId, source: Source) -> Source:
    """Replaces the existing entry matching `source.id`. Raises KeyError if not found."""
    async with _lock_for(project_id):
        path = _project_file(project_id, _SOURCES_FILE)
        raw = _read_yaml(path) or []
        for i, item in enumerate(raw):
            if str(item.get("id")) == str(source.id):
                raw[i] = source.model_dump(mode="json")
                break
        else:
            raise KeyError(f"source {source.id} not found in project {project_id}")
        _atomic_write_yaml(path, raw)
    return source


# ---------------------------------------------------------------------------
# portals
# ---------------------------------------------------------------------------

def list_portals(project_id: ProjectId) -> list[Portal]:
    raw = _read_yaml(_project_file(project_id, _PORTALS_FILE)) or []
    return [Portal.model_validate(p) for p in raw]


def get_portal(project_id: ProjectId, portal_id: ProjectId) -> Optional[Portal]:
    for p in list_portals(project_id):
        if str(p.id) == str(portal_id):
            return p
    return None


async def append_portal(project_id: ProjectId, portal: Portal) -> Portal:
    async with _lock_for(project_id):
        path = _project_file(project_id, _PORTALS_FILE)
        raw = _read_yaml(path) or []
        raw.append(portal.model_dump(mode="json"))
        _atomic_write_yaml(path, raw)
    return portal


async def update_portal(project_id: ProjectId, portal: Portal) -> Portal:
    """Replaces the existing entry matching `portal.id`. Raises KeyError if not found."""
    async with _lock_for(project_id):
        path = _project_file(project_id, _PORTALS_FILE)
        raw = _read_yaml(path) or []
        for i, item in enumerate(raw):
            if str(item.get("id")) == str(portal.id):
                raw[i] = portal.model_dump(mode="json")
                break
        else:
            raise KeyError(f"portal {portal.id} not found in project {project_id}")
        _atomic_write_yaml(path, raw)
    return portal


async def delete_portal(project_id: ProjectId, portal_id: ProjectId) -> None:
    """No-op if the portal is already gone."""
    async with _lock_for(project_id):
        path = _project_file(project_id, _PORTALS_FILE)
        raw = _read_yaml(path) or []
        filtered = [item for item in raw if str(item.get("id")) != str(portal_id)]
        _atomic_write_yaml(path, filtered)


# ---------------------------------------------------------------------------
# opportunities
# ---------------------------------------------------------------------------

def list_opportunities(project_id: ProjectId) -> list[Opportunity]:
    raw = _read_yaml(_project_file(project_id, _OPPORTUNITIES_FILE)) or []
    return [Opportunity.model_validate(o) for o in raw]


def get_opportunity(project_id: ProjectId, opportunity_id: ProjectId) -> Optional[Opportunity]:
    for o in list_opportunities(project_id):
        if str(o.id) == str(opportunity_id):
            return o
    return None


async def append_opportunity(project_id: ProjectId, opportunity: Opportunity) -> Opportunity:
    async with _lock_for(project_id):
        path = _project_file(project_id, _OPPORTUNITIES_FILE)
        raw = _read_yaml(path) or []
        raw.append(opportunity.model_dump(mode="json"))
        _atomic_write_yaml(path, raw)
    return opportunity


async def append_opportunities(project_id: ProjectId, opportunities: list[Opportunity]) -> list[Opportunity]:
    """Bulk variant of append_opportunity (matches the old `db.add_all(rows)` discover-flow)."""
    async with _lock_for(project_id):
        path = _project_file(project_id, _OPPORTUNITIES_FILE)
        raw = _read_yaml(path) or []
        raw.extend(o.model_dump(mode="json") for o in opportunities)
        _atomic_write_yaml(path, raw)
    return opportunities


async def update_opportunity(project_id: ProjectId, opportunity: Opportunity) -> Opportunity:
    """Replaces the existing entry matching `opportunity.id`. Raises KeyError if not found."""
    async with _lock_for(project_id):
        path = _project_file(project_id, _OPPORTUNITIES_FILE)
        raw = _read_yaml(path) or []
        for i, item in enumerate(raw):
            if str(item.get("id")) == str(opportunity.id):
                raw[i] = opportunity.model_dump(mode="json")
                break
        else:
            raise KeyError(f"opportunity {opportunity.id} not found in project {project_id}")
        _atomic_write_yaml(path, raw)
    return opportunity


# ---------------------------------------------------------------------------
# content items (+ nested versions / quality reports)
# ---------------------------------------------------------------------------

def list_content_items(project_id: ProjectId) -> list[ContentItem]:
    """Scans `<data_dir>/<project_id>/content/*.yaml`, newest first by created_at."""
    dir_path = _project_dir(project_id) / _CONTENT_DIR
    if not dir_path.exists():
        return []
    items: list[ContentItem] = []
    for f in dir_path.glob("*.yaml"):
        raw = _read_yaml(f)
        if raw and raw.get("item"):
            items.append(ContentItem.model_validate(raw["item"]))
    items.sort(key=lambda c: c.created_at, reverse=True)
    return items


def get_content_item(project_id: ProjectId, content_id: ProjectId) -> Optional[ContentItem]:
    raw = _read_yaml(_content_file(project_id, content_id))
    if not raw or not raw.get("item"):
        return None
    return ContentItem.model_validate(raw["item"])


async def save_content_item(project_id: ProjectId, item: ContentItem) -> ContentItem:
    """
    Upsert: creates content/<id>.yaml if new, otherwise overwrites the `item`
    half only -- `versions`/`quality_reports` already on disk are preserved.
    """
    async with _lock_for(project_id):
        path = _content_file(project_id, item.id)
        raw = _read_yaml(path) or {}
        raw["item"] = item.model_dump(mode="json")
        raw.setdefault("versions", [])
        raw.setdefault("quality_reports", [])
        _atomic_write_yaml(path, raw)
    return item


async def delete_content_item(project_id: ProjectId, content_id: ProjectId) -> None:
    async with _lock_for(project_id):
        path = _content_file(project_id, content_id)
        if path.exists():
            path.unlink()


def list_content_versions(project_id: ProjectId, content_id: ProjectId) -> list[ContentVersion]:
    raw = _read_yaml(_content_file(project_id, content_id)) or {}
    return [ContentVersion.model_validate(v) for v in raw.get("versions", [])]


async def append_content_version(
    project_id: ProjectId, content_id: ProjectId, version: ContentVersion
) -> ContentVersion:
    async with _lock_for(project_id):
        path = _content_file(project_id, content_id)
        raw = _read_yaml(path) or {}
        raw.setdefault("versions", []).append(version.model_dump(mode="json"))
        _atomic_write_yaml(path, raw)
    return version


def list_quality_reports(project_id: ProjectId, content_id: ProjectId) -> list[QualityReport]:
    raw = _read_yaml(_content_file(project_id, content_id)) or {}
    return [QualityReport.model_validate(q) for q in raw.get("quality_reports", [])]


async def append_quality_report(
    project_id: ProjectId, content_id: ProjectId, report: QualityReport
) -> QualityReport:
    async with _lock_for(project_id):
        path = _content_file(project_id, content_id)
        raw = _read_yaml(path) or {}
        raw.setdefault("quality_reports", []).append(report.model_dump(mode="json"))
        _atomic_write_yaml(path, raw)
    return report


# ---------------------------------------------------------------------------
# generation jobs
# ---------------------------------------------------------------------------

def list_jobs(project_id: ProjectId) -> list[GenerationJob]:
    raw = _read_yaml(_project_file(project_id, _JOBS_FILE)) or []
    return [GenerationJob.model_validate(j) for j in raw]


def get_job(project_id: ProjectId, job_id: ProjectId) -> Optional[GenerationJob]:
    for j in list_jobs(project_id):
        if str(j.id) == str(job_id):
            return j
    return None


async def save_job(project_id: ProjectId, job: GenerationJob) -> GenerationJob:
    """Upsert into jobs.yaml: replaces the entry matching `job.id`, else appends."""
    async with _lock_for(project_id):
        path = _project_file(project_id, _JOBS_FILE)
        raw = _read_yaml(path) or []
        for i, item in enumerate(raw):
            if str(item.get("id")) == str(job.id):
                raw[i] = job.model_dump(mode="json")
                break
        else:
            raw.append(job.model_dump(mode="json"))
        _atomic_write_yaml(path, raw)
    return job


# ---------------------------------------------------------------------------
# export packages
# ---------------------------------------------------------------------------

def list_export_packages(project_id: ProjectId) -> list[ExportPackage]:
    raw = _read_yaml(_project_file(project_id, _EXPORTS_FILE)) or []
    return [ExportPackage.model_validate(e) for e in raw]


def get_export_package(project_id: ProjectId, export_id: ProjectId) -> Optional[ExportPackage]:
    for e in list_export_packages(project_id):
        if str(e.id) == str(export_id):
            return e
    return None


async def save_export_package(project_id: ProjectId, package: ExportPackage) -> ExportPackage:
    """Upsert into exports.yaml: replaces the entry matching `package.id`, else appends."""
    async with _lock_for(project_id):
        path = _project_file(project_id, _EXPORTS_FILE)
        raw = _read_yaml(path) or []
        for i, item in enumerate(raw):
            if str(item.get("id")) == str(package.id):
                raw[i] = package.model_dump(mode="json")
                break
        else:
            raw.append(package.model_dump(mode="json"))
        _atomic_write_yaml(path, raw)
    return package


# ---------------------------------------------------------------------------
# knowledge documents / chunks / packs
# ---------------------------------------------------------------------------

def _read_knowledge(project_id: ProjectId) -> dict:
    raw = _read_yaml(_project_file(project_id, _KNOWLEDGE_FILE)) or {}
    raw.setdefault("documents", [])
    raw.setdefault("chunks", [])
    raw.setdefault("packs", [])
    return raw


def list_knowledge_documents(project_id: ProjectId) -> list[KnowledgeDocument]:
    return [KnowledgeDocument.model_validate(d) for d in _read_knowledge(project_id)["documents"]]


def get_knowledge_document(project_id: ProjectId, document_id: ProjectId) -> Optional[KnowledgeDocument]:
    for d in list_knowledge_documents(project_id):
        if str(d.id) == str(document_id):
            return d
    return None


async def save_knowledge_document(project_id: ProjectId, document: KnowledgeDocument) -> KnowledgeDocument:
    """Upsert: replaces the entry matching `document.id`, else appends."""
    async with _lock_for(project_id):
        path = _project_file(project_id, _KNOWLEDGE_FILE)
        raw = _read_yaml(path) or {}
        raw.setdefault("documents", [])
        raw.setdefault("chunks", [])
        raw.setdefault("packs", [])
        for i, item in enumerate(raw["documents"]):
            if str(item.get("id")) == str(document.id):
                raw["documents"][i] = document.model_dump(mode="json")
                break
        else:
            raw["documents"].append(document.model_dump(mode="json"))
        _atomic_write_yaml(path, raw)
    return document


def list_knowledge_chunks(
    project_id: ProjectId, document_id: Optional[ProjectId] = None
) -> list[KnowledgeChunk]:
    chunks = [KnowledgeChunk.model_validate(c) for c in _read_knowledge(project_id)["chunks"]]
    if document_id is not None:
        chunks = [c for c in chunks if str(c.document_id) == str(document_id)]
    return chunks


async def append_knowledge_chunks(
    project_id: ProjectId, chunks: list[KnowledgeChunk]
) -> list[KnowledgeChunk]:
    """Bulk-append (matches the old vector_store.insert_chunks bulk-insert pattern)."""
    async with _lock_for(project_id):
        path = _project_file(project_id, _KNOWLEDGE_FILE)
        raw = _read_yaml(path) or {}
        raw.setdefault("documents", [])
        raw.setdefault("chunks", [])
        raw.setdefault("packs", [])
        raw["chunks"].extend(c.model_dump(mode="json") for c in chunks)
        _atomic_write_yaml(path, raw)
    return chunks


def list_knowledge_packs(project_id: ProjectId) -> list[KnowledgePack]:
    return [KnowledgePack.model_validate(p) for p in _read_knowledge(project_id)["packs"]]


def get_knowledge_pack(project_id: ProjectId, pack_id: ProjectId) -> Optional[KnowledgePack]:
    for p in list_knowledge_packs(project_id):
        if str(p.id) == str(pack_id):
            return p
    return None


async def save_knowledge_pack(project_id: ProjectId, pack: KnowledgePack) -> KnowledgePack:
    """Upsert: replaces the entry matching `pack.id`, else appends."""
    async with _lock_for(project_id):
        path = _project_file(project_id, _KNOWLEDGE_FILE)
        raw = _read_yaml(path) or {}
        raw.setdefault("documents", [])
        raw.setdefault("chunks", [])
        raw.setdefault("packs", [])
        for i, item in enumerate(raw["packs"]):
            if str(item.get("id")) == str(pack.id):
                raw["packs"][i] = pack.model_dump(mode="json")
                break
        else:
            raw["packs"].append(pack.model_dump(mode="json"))
        _atomic_write_yaml(path, raw)
    return pack


# ---------------------------------------------------------------------------
# global system settings (data/settings.yaml -- not project-scoped)
# ---------------------------------------------------------------------------

def get_settings() -> AppSetting:
    raw = _read_yaml(_data_dir() / _SETTINGS_FILE)
    if not raw:
        return AppSetting()
    return AppSetting.model_validate(raw)


async def save_settings(app_setting: AppSetting) -> AppSetting:
    async with _settings_lock:
        _atomic_write_yaml(_data_dir() / _SETTINGS_FILE, app_setting.model_dump(mode="json"))
    return app_setting
