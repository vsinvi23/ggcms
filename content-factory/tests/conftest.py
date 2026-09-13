from __future__ import annotations

"""
Shared pytest fixtures for the AI Learning Content Factory test suite.

Two things every test in this suite needs:

1. Filesystem isolation for backend.storage.file_store -- file_store resolves
   its base path from `backend.configs.settings.settings.data_dir` (a plain
   mutable pydantic-settings singleton, not re-read from an env var at call
   time -- see `file_store._data_dir()`, `return Path(_config.data_dir)`).
   FINDING: there is no dedicated test-isolation override for this (no
   `FILE_STORE_TEST_DIR`-style env var, no constructor parameter on
   file_store's functions, nothing in AppSetting either). The only override
   point is mutating the already-mutable `settings.data_dir` attribute
   directly -- exactly what `backend/services/system_settings_service.
   apply_overrides` already does for other fields at runtime. `temp_project`
   below does the same via `monkeypatch.setattr`, so it's restored
   automatically even if a test raises.

2. Minimal, valid instances of the core domain models, so unit tests don't
   each need to know every required field by heart. Kept intentionally thin
   -- these are plain builder functions (exposed both as fixtures and as
   importable functions), not a mocking framework; every field has a
   sensible default and every override is a plain kwarg.
"""
import uuid

import pytest

from backend.configs.settings import settings
from backend.models.domain import (
    ContentJob,
    EvidencePack as DomainEvidencePack,
    ExportPackage,
    GenerationJob,
    KnowledgePack,
    Opportunity,
    Project,
)
from backend.schemas.evidence_pack import Claim, EvidencePack as SchemaEvidencePack


# ---------------------------------------------------------------------------
# mock-mode / filesystem isolation
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def mock_mode_on(monkeypatch):
    """
    Forces settings.mock_mode = True for every test in this suite.

    This reuses the exact mock-mode canned-response path every agent already
    checks (`if settings.mock_mode: return <canned ...>`, e.g.
    backend/agents/research_agent.py:24) instead of inventing a new mocking
    approach -- it's the same MOCK_MODE=true harness pattern `run_test.py`
    already exercises end-to-end at the repo root. Autouse: nothing in this
    suite should ever attempt a real LLM/network call.
    """
    monkeypatch.setattr(settings, "mock_mode", True)


@pytest.fixture
def temp_project(tmp_path, monkeypatch):
    """
    Points backend.storage.file_store at a temp directory for the duration
    of one test, so tests never read/write the real ./data directory and
    never leak state between tests or into the developer's working tree.

    See module docstring finding above re: settings.data_dir being the only
    override point. `file_store._project_locks` is a module-level dict keyed
    by `str(project_id)`; a fresh random project_id per test plus a fresh
    tmp_path is sufficient isolation without needing to touch that dict.

    Yields a fresh random `project_id` (str) -- callers create/write
    whatever project-scoped files they need via the ordinary file_store
    accessors (e.g. `file_store.save_job(project_id, job)`), and they will
    land under `tmp_path/<project_id>/...`.
    """
    monkeypatch.setattr(settings, "data_dir", str(tmp_path))
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# minimal valid domain-model builders
# ---------------------------------------------------------------------------

def make_project(**overrides) -> Project:
    defaults = dict(
        name="Test Project",
        niche=["python"],
        audience=["beginners"],
    )
    defaults.update(overrides)
    return Project(**defaults)


def make_opportunity(project_id: uuid.UUID | str, **overrides) -> Opportunity:
    defaults = dict(
        project_id=uuid.UUID(str(project_id)),
        topic="Python Asyncio Fundamentals",
        score=82.5,
        status="DISCOVERED",
    )
    defaults.update(overrides)
    return Opportunity(**defaults)


def make_knowledge_pack(project_id: uuid.UUID | str, **overrides) -> KnowledgePack:
    defaults = dict(
        project_id=uuid.UUID(str(project_id)),
        topic="Python Asyncio Fundamentals",
    )
    defaults.update(overrides)
    return KnowledgePack(**defaults)


def make_evidence_pack(**overrides) -> DomainEvidencePack:
    """
    Builds a `backend.models.domain.EvidencePack` -- the file-store-shaped
    domain model (own `id`/`research_run_id`/`created_at`). NOTE: this repo
    currently has *two* EvidencePack classes. This is the domain one; it is
    not currently written/read by any `file_store.py` accessor (grepped --
    no match), so it exists as a modeled entity ahead of its own persistence
    wiring. The one actually produced at runtime by `ResearchAgent.run` and
    threaded through `content_pipeline.py`'s `PipelineState["evidence_pack"]`
    is `backend.schemas.evidence_pack.EvidencePack` -- see
    `make_schema_evidence_pack` below for that one. Use whichever the code
    under test actually consumes.
    """
    defaults = dict(
        research_run_id=uuid.uuid4(),
        topic="Python Asyncio Fundamentals",
    )
    defaults.update(overrides)
    return DomainEvidencePack(**defaults)


def make_schema_evidence_pack(**overrides) -> SchemaEvidencePack:
    """
    Builds a `backend.schemas.evidence_pack.EvidencePack` -- the Pydantic
    schema used as `ResearchAgent`'s `with_structured_output` target.
    """
    defaults = dict(
        topic="Python Asyncio Fundamentals",
        claims=[
            Claim(
                claim="asyncio.gather runs coroutines concurrently",
                evidence="Documented behavior of asyncio.gather in the stdlib docs.",
                source="https://docs.python.org/3/library/asyncio-task.html",
                confidence=0.95,
            )
        ],
    )
    defaults.update(overrides)
    return SchemaEvidencePack(**defaults)


def make_generation_job(project_id: uuid.UUID | str, **overrides) -> GenerationJob:
    defaults = dict(
        project_id=uuid.UUID(str(project_id)),
        topic="Python Asyncio Fundamentals",
    )
    defaults.update(overrides)
    return GenerationJob(**defaults)


def make_content_job(
    project_id: uuid.UUID | str,
    opportunity_id: uuid.UUID | str,
    knowledge_pack_id: uuid.UUID | str,
    **overrides,
) -> ContentJob:
    defaults = dict(
        project_id=uuid.UUID(str(project_id)),
        opportunity_id=uuid.UUID(str(opportunity_id)),
        knowledge_pack_id=uuid.UUID(str(knowledge_pack_id)),
        content_type="article",
    )
    defaults.update(overrides)
    return ContentJob(**defaults)


def make_export_package(project_id: uuid.UUID | str, **overrides) -> ExportPackage:
    defaults = dict(
        project_id=uuid.UUID(str(project_id)),
        manifest={"title": "Test Export"},
    )
    defaults.update(overrides)
    return ExportPackage(**defaults)


@pytest.fixture
def project_factory():
    return make_project


@pytest.fixture
def opportunity_factory():
    return make_opportunity


@pytest.fixture
def knowledge_pack_factory():
    return make_knowledge_pack


@pytest.fixture
def evidence_pack_factory():
    return make_evidence_pack


@pytest.fixture
def schema_evidence_pack_factory():
    return make_schema_evidence_pack


@pytest.fixture
def generation_job_factory():
    return make_generation_job


@pytest.fixture
def content_job_factory():
    return make_content_job


@pytest.fixture
def export_package_factory():
    return make_export_package
