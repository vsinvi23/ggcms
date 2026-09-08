"""
Observability domain model for the autonomous content factory.

`AgentRunLogEntry` is deliberately NOT part of `backend/models/domain.py`'s
`__all__` set of file-store-backed entities -- per implementation plan §6.4,
it is an append-only observability log record, not a queryable domain
entity with its own read-modify-write accessors. It is persisted via
`backend/storage/agent_run_log.py` as JSONL (one line per entry) rather than
the whole-file YAML-list pattern the rest of `file_store.py` uses, because
this log is expected to be high-volume (one entry per agent invocation,
scoring decision, quality verdict, and publish attempt).

Fields mirror the implementation plan exactly:

  * `job_id` links to a `ContentJob` (added in a parallel Wave 1 workstream,
    `backend/models/domain.py`) when the run happened in the context of one.
    Deliberately typed as a bare `uuid.UUID | None` here rather than
    importing `ContentJob`, to avoid a cross-workstream edit dependency
    while that model is still landing in parallel.
  * `topic_id` links to an `Opportunity` (the topic-registry entity this
    factory reuses instead of a standalone `Topic` model -- see plan §6.1).
"""
import uuid
from datetime import datetime

from pydantic import BaseModel

__all__ = ["AgentRunLogEntry"]


class AgentRunLogEntry(BaseModel):
    run_id: uuid.UUID
    job_id: uuid.UUID | None = None
    topic_id: uuid.UUID | None = None
    agent_name: str
    start_time: datetime
    end_time: datetime | None = None
    status: str  # RUNNING | SUCCEEDED | FAILED
    model: str | None = None
    token_usage: dict | None = None  # {prompt_tokens, completion_tokens}
    estimated_cost: float | None = None
    retry_count: int = 0
    input_version: str | None = None
    output_version: str | None = None
    decision_reason: str | None = None  # "why selected" / "why rejected" / "why human review" etc.
