from __future__ import annotations
"""
Append-only observability log for agent runs (implementation plan §6.4/§15).

Every agent invocation, scoring decision, quality-gate verdict, and publish
attempt gets one `AgentRunLogEntry` line in `data/<project_id>/agent_runs.jsonl`.
This is deliberately NOT the whole-file-rewrite YAML-list pattern the rest of
`backend/storage/file_store.py` uses for `opportunities.yaml`/`jobs.yaml`/etc:
this log is expected to be high-volume, so an append must be O(1) (open in
append mode, write one JSON line + newline, flush) rather than an O(n)
read-modify-write of the whole file.

Locking: `file_store.py::_lock_for` is a *private* (leading-underscore),
module-internal helper -- it is not re-exported and its `_project_locks` dict
is not meant to be imported and shared across modules. Rather than reach into
file_store's private internals (and rather than have this JSONL append
contend with unrelated YAML read-modify-writes for the same project, e.g. a
concurrent `opportunities.yaml` update), this module replicates the identical
per-project `asyncio.Lock` pattern locally, scoped to its own file. This keeps
the module self-contained -- matching the plan's description of this as "a
dedicated small helper module" -- while still guarding every append the same
way file_store.py guards its read-modify-write spans.

Directory layout:

    data/<project_id>/agent_runs.jsonl   <- one AgentRunLogEntry per line (JSON)
"""
import asyncio
import json
import uuid
from pathlib import Path
from typing import Optional, Union

from backend.configs.settings import settings as _config
from backend.models.agent_run import AgentRunLogEntry

ProjectId = Union[uuid.UUID, str]

_AGENT_RUNS_FILE = "agent_runs.jsonl"

# ---------------------------------------------------------------------------
# per-project locks (mirrors file_store.py::_lock_for, kept local -- see
# module docstring for why this isn't a shared import)
# ---------------------------------------------------------------------------

_project_locks: dict[str, asyncio.Lock] = {}


def _lock_for(project_id: ProjectId) -> asyncio.Lock:
    """
    Returns the module-level asyncio.Lock for this project's agent-run log,
    creating it on first use. Safe without extra synchronization: dict.get/
    setdefault here runs synchronously with no `await` in between, so there's
    no window for two coroutines to race and create two different Lock
    objects for the same project on a single-threaded event loop.
    """
    key = str(project_id)
    return _project_locks.setdefault(key, asyncio.Lock())


def _agent_runs_path(project_id: ProjectId) -> Path:
    return Path(_config.data_dir) / str(project_id) / _AGENT_RUNS_FILE


# ---------------------------------------------------------------------------
# append / read
# ---------------------------------------------------------------------------

async def append_agent_run(project_id: ProjectId, entry: AgentRunLogEntry) -> None:
    """
    Appends one `AgentRunLogEntry` as a single JSON line to
    `data/<project_id>/agent_runs.jsonl`, guarded by this project's lock.

    O(1) per append: open in append mode, write one line + newline, flush --
    never a read-modify-write of the whole file. Creates the project
    directory on first write if it doesn't exist yet.
    """
    path = _agent_runs_path(project_id)
    line = entry.model_dump_json() + "\n"
    async with _lock_for(project_id):
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(line)
            f.flush()


def read_agent_runs(
    project_id: ProjectId,
    job_id: Optional[uuid.UUID] = None,
    topic_id: Optional[uuid.UUID] = None,
) -> list[AgentRunLogEntry]:
    """
    Reads and parses `data/<project_id>/agent_runs.jsonl`, returning `[]` if
    the file doesn't exist yet (matching the existing file_store.py pattern
    for e.g. a project with no `exports.yaml` yet). Optionally filters by
    `job_id`/`topic_id`.
    """
    path = _agent_runs_path(project_id)
    if not path.exists():
        return []

    entries: list[AgentRunLogEntry] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            entries.append(AgentRunLogEntry.model_validate(json.loads(line)))

    if job_id is not None:
        entries = [e for e in entries if e.job_id == job_id]
    if topic_id is not None:
        entries = [e for e in entries if e.topic_id == topic_id]
    return entries
