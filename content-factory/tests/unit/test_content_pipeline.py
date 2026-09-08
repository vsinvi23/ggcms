"""
Unit tests for backend/workflows/content_pipeline.py's should_revise, per
plan §1/§12: "revision-loop cap respected (settings.max_revisions, fixing
the hardcoded-3 bug ... as part of this work so the test can actually vary
it)".

should_revise is a pure function of `state` plus the module-level
`settings.max_revisions` (imported as `from backend.configs.settings import
settings` at module scope in content_pipeline.py, then read live via
attribute access at call time -- so monkeypatching the attribute on the
shared `settings` singleton, the same object content_pipeline.py imported,
takes effect immediately without needing to reload the module). Tested
directly against the function, not via a full LangGraph `graph.ainvoke` run,
per the task's guidance to avoid needing agents/LLM calls for this.
"""
import pytest

from backend.configs.settings import settings
from backend.workflows.content_pipeline import should_revise


@pytest.fixture
def with_max_revisions(monkeypatch):
    def _set(value: int):
        monkeypatch.setattr(settings, "max_revisions", value)
    return _set


class TestShouldRevise:
    def test_approved_state_always_exports_regardless_of_revisions_count(self, with_max_revisions):
        with_max_revisions(3)
        state = {"is_approved": True, "revisions_count": 0}
        assert should_revise(state) == "export_package"

    def test_default_cap_of_3_revises_below_cap(self, with_max_revisions):
        with_max_revisions(3)
        state = {"is_approved": False, "revisions_count": 2}
        assert should_revise(state) == "revise"

    def test_default_cap_of_3_exports_at_cap(self, with_max_revisions):
        with_max_revisions(3)
        state = {"is_approved": False, "revisions_count": 3}
        assert should_revise(state) == "export_package"

    def test_configured_cap_of_1_exports_immediately_at_1(self, with_max_revisions):
        # This is the case the old hardcoded `3` literal got wrong: with
        # max_revisions=1, revisions_count=1 must export, not revise again
        # (the old code would have kept revising until 3 regardless of this
        # setting).
        with_max_revisions(1)
        state = {"is_approved": False, "revisions_count": 1}
        assert should_revise(state) == "export_package"

    def test_configured_cap_of_1_still_revises_below_cap(self, with_max_revisions):
        with_max_revisions(1)
        state = {"is_approved": False, "revisions_count": 0}
        assert should_revise(state) == "revise"

    def test_configured_cap_of_5_keeps_revising_past_the_old_hardcoded_3(self, with_max_revisions):
        # This is the other direction the old hardcoded `3` literal got
        # wrong: with max_revisions=5, revisions_count=3 or 4 must still
        # revise, not export early.
        with_max_revisions(5)
        state = {"is_approved": False, "revisions_count": 3}
        assert should_revise(state) == "revise"

        state = {"is_approved": False, "revisions_count": 4}
        assert should_revise(state) == "revise"

    def test_configured_cap_of_5_exports_at_5(self, with_max_revisions):
        with_max_revisions(5)
        state = {"is_approved": False, "revisions_count": 5}
        assert should_revise(state) == "export_package"

    def test_missing_is_approved_key_defaults_to_not_approved(self, with_max_revisions):
        with_max_revisions(3)
        state = {"revisions_count": 0}  # no "is_approved" key at all
        assert should_revise(state) == "revise"
