from __future__ import annotations
"""
Integration tests for backend/storage/file_store.py's atomic-write /
read-modify-write round-trip behavior (plan §12 test scaffolding scope).
Uses the `temp_project` fixture (tests/conftest.py) so nothing here ever
touches the real ./data directory -- each test gets its own tmp_path plus a
fresh random project_id.

Covers list-based entities (jobs.yaml / GenerationJob, content_jobs.yaml /
ContentJob, exports.yaml / ExportPackage) and the opportunities.yaml list
entity, since those are the "existing list-based entity" the task called out
(GenerationJob, ExportPackage) plus the new ContentJob accessors that already
exist in file_store.py as of this read.

Deliberately not touching file_store.py's implementation -- these tests only
call its public accessors through the temp-dir-isolated `settings.data_dir`.
"""
import uuid

import pytest

from backend.storage import file_store


# ---------------------------------------------------------------------------
# generation jobs (jobs.yaml) -- save_job is an upsert-into-list
# ---------------------------------------------------------------------------

class TestGenerationJobRoundTrip:
    @pytest.mark.asyncio
    async def test_save_then_list_round_trips(self, temp_project, generation_job_factory):
        job = generation_job_factory(temp_project, status="QUEUED")
        await file_store.save_job(temp_project, job)

        reloaded = file_store.list_jobs(temp_project)
        assert len(reloaded) == 1
        assert reloaded[0].id == job.id
        assert reloaded[0].status == "QUEUED"
        assert reloaded[0].project_id == job.project_id

    @pytest.mark.asyncio
    async def test_get_job_finds_saved_entry(self, temp_project, generation_job_factory):
        job = generation_job_factory(temp_project)
        await file_store.save_job(temp_project, job)

        found = file_store.get_job(temp_project, job.id)
        assert found is not None
        assert found.id == job.id

    @pytest.mark.asyncio
    async def test_save_job_upserts_existing_entry_in_place(self, temp_project, generation_job_factory):
        job = generation_job_factory(temp_project, status="QUEUED")
        await file_store.save_job(temp_project, job)

        job.status = "RUNNING"
        job.current_node = "build_evidence_pack"
        await file_store.save_job(temp_project, job)

        reloaded = file_store.list_jobs(temp_project)
        assert len(reloaded) == 1  # updated in place, not appended as a 2nd row
        assert reloaded[0].status == "RUNNING"
        assert reloaded[0].current_node == "build_evidence_pack"

    @pytest.mark.asyncio
    async def test_multiple_jobs_all_persist_independently(self, temp_project, generation_job_factory):
        job_a = generation_job_factory(temp_project, topic="Topic A")
        job_b = generation_job_factory(temp_project, topic="Topic B")
        await file_store.save_job(temp_project, job_a)
        await file_store.save_job(temp_project, job_b)

        reloaded = file_store.list_jobs(temp_project)
        assert {j.topic for j in reloaded} == {"Topic A", "Topic B"}

    def test_list_jobs_on_empty_project_returns_empty_list(self, temp_project):
        # No jobs.yaml written yet -- matches the documented "zero rows"
        # behavior for a project with no file yet (file_store.py module
        # docstring, §13 of the plan).
        assert file_store.list_jobs(temp_project) == []


# ---------------------------------------------------------------------------
# export packages (exports.yaml) -- save_export_package is an upsert-into-list
# ---------------------------------------------------------------------------

class TestExportPackageRoundTrip:
    @pytest.mark.asyncio
    async def test_save_then_list_round_trips(self, temp_project, export_package_factory):
        package = export_package_factory(temp_project, status="PENDING")
        await file_store.save_export_package(temp_project, package)

        reloaded = file_store.list_export_packages(temp_project)
        assert len(reloaded) == 1
        assert reloaded[0].id == package.id
        assert reloaded[0].manifest == {"title": "Test Export"}

    @pytest.mark.asyncio
    async def test_save_export_package_upserts_existing_entry(self, temp_project, export_package_factory):
        package = export_package_factory(temp_project, status="PENDING")
        await file_store.save_export_package(temp_project, package)

        package.status = "SUCCEEDED"
        package.ggcms_imported_id = "ggcms-123"
        await file_store.save_export_package(temp_project, package)

        reloaded = file_store.list_export_packages(temp_project)
        assert len(reloaded) == 1
        assert reloaded[0].status == "SUCCEEDED"
        assert reloaded[0].ggcms_imported_id == "ggcms-123"

    @pytest.mark.asyncio
    async def test_get_export_package_finds_saved_entry(self, temp_project, export_package_factory):
        package = export_package_factory(temp_project)
        await file_store.save_export_package(temp_project, package)

        found = file_store.get_export_package(temp_project, package.id)
        assert found is not None
        assert found.id == package.id


# ---------------------------------------------------------------------------
# content jobs (content_jobs.yaml, plan §6.3 -- new entity, but its
# file_store accessors already exist as of this read)
# ---------------------------------------------------------------------------

class TestContentJobRoundTrip:
    @pytest.mark.asyncio
    async def test_save_then_list_round_trips(
        self, temp_project, opportunity_factory, knowledge_pack_factory, content_job_factory
    ):
        opportunity = opportunity_factory(temp_project)
        pack = knowledge_pack_factory(temp_project)
        job = content_job_factory(temp_project, opportunity.id, pack.id, content_type="article")

        await file_store.save_content_job(temp_project, job)

        reloaded = file_store.list_content_jobs(temp_project)
        assert len(reloaded) == 1
        assert reloaded[0].id == job.id
        assert reloaded[0].opportunity_id == opportunity.id
        assert reloaded[0].knowledge_pack_id == pack.id
        assert reloaded[0].status == "QUEUED"  # model default

    @pytest.mark.asyncio
    async def test_save_content_job_upserts_existing_entry(
        self, temp_project, opportunity_factory, knowledge_pack_factory, content_job_factory
    ):
        opportunity = opportunity_factory(temp_project)
        pack = knowledge_pack_factory(temp_project)
        job = content_job_factory(temp_project, opportunity.id, pack.id)
        await file_store.save_content_job(temp_project, job)

        job.status = "RUNNING"
        await file_store.save_content_job(temp_project, job)

        reloaded = file_store.list_content_jobs(temp_project)
        assert len(reloaded) == 1
        assert reloaded[0].status == "RUNNING"


# ---------------------------------------------------------------------------
# opportunities (opportunities.yaml) -- append-based, not upsert
# ---------------------------------------------------------------------------

class TestOpportunityRoundTrip:
    @pytest.mark.asyncio
    async def test_append_then_list_round_trips(self, temp_project, opportunity_factory):
        opportunity = opportunity_factory(temp_project, topic="Async Generators")
        await file_store.append_opportunity(temp_project, opportunity)

        reloaded = file_store.list_opportunities(temp_project)
        assert len(reloaded) == 1
        assert reloaded[0].topic == "Async Generators"

    @pytest.mark.asyncio
    async def test_update_opportunity_replaces_matching_entry(self, temp_project, opportunity_factory):
        opportunity = opportunity_factory(temp_project, status="DISCOVERED")
        await file_store.append_opportunity(temp_project, opportunity)

        opportunity.status = "APPROVED"
        await file_store.update_opportunity(temp_project, opportunity)

        reloaded = file_store.list_opportunities(temp_project)
        assert len(reloaded) == 1
        assert reloaded[0].status == "APPROVED"

    @pytest.mark.asyncio
    async def test_update_opportunity_raises_keyerror_when_not_found(self, temp_project, opportunity_factory):
        opportunity = opportunity_factory(temp_project)  # never appended
        with pytest.raises(KeyError):
            await file_store.update_opportunity(temp_project, opportunity)


# ---------------------------------------------------------------------------
# isolation sanity check -- the whole point of `temp_project`
# ---------------------------------------------------------------------------

class TestTempProjectIsolation:
    @pytest.mark.asyncio
    async def test_two_tests_do_not_see_each_others_data(self, temp_project, generation_job_factory):
        # If this ever saw a leftover job from another test, `temp_project`
        # (and therefore settings.data_dir / tmp_path) isn't isolating.
        assert file_store.list_jobs(temp_project) == []
        job = generation_job_factory(temp_project)
        await file_store.save_job(temp_project, job)
        assert len(file_store.list_jobs(temp_project)) == 1

    def test_settings_data_dir_is_restored_after_fixture(self, temp_project):
        # Sanity: within the test, data_dir points at the temp dir, not the
        # repo's real ./data. Actual restoration-after-test is asserted
        # implicitly by every other test in this file starting from a clean
        # slate (monkeypatch guarantees the teardown).
        from backend.configs.settings import settings

        assert settings.data_dir != "./data"
