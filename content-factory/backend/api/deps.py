"""
STAGE 1 REWRITE: this module used to construct the SQLAlchemy async engine
(from `settings.database_url`) and expose `get_db()` -- an `AsyncGenerator`
FastAPI dependency yielding an `AsyncSession` -- plus `AsyncSessionLocal`
for the few call sites that opened their own session outside a request
(background tasks in `backend/api/routers/generation.py`).

The project has moved to file-based YAML storage
(`backend/storage/file_store.py`). There is no engine, no connection pool,
and no per-request session to inject, so:

DECISION (binding for later stages -- do not re-derive this):
`get_db` (and `AsyncSessionLocal`, `engine`) are REMOVED ENTIRELY, not kept
as a passthrough/no-op dependency. Routers import
`backend.storage.file_store` directly at module level and call its
functions with an explicit `project_id` (and, for the async
read-modify-write functions, `await`) -- no injected dependency, no
`Depends(...)` line, no `db` parameter. `file_store`'s read functions
(`list_*`/`get_*`) are plain sync functions; its write functions
(`save_*`/`append_*`/`update_*`/`delete_*`) are `async def` and take the
per-project `asyncio.Lock` internally, so routers just do:

    from backend.storage import file_store

    @router.get("/projects/{project_id}")
    async def get_project(project_id: uuid.UUID):
        project = file_store.load_project(project_id)
        ...

    @router.post("/projects/{project_id}/sources")
    async def create_source(project_id: uuid.UUID, payload: SourceCreate):
        source = Source(project_id=project_id, ...)
        await file_store.append_source(project_id, source)
        ...

This was chosen over a no-op `get_db` shim because every router call site
has to change anyway (a SQLAlchemy query/`db.add`/`db.commit` becomes a
`file_store` call with different arguments) -- keeping a vestigial
`Depends(get_db)` parameter around would not reduce that churn, it would
just leave one more thing for the router-rewrite stage to delete.

This module intentionally exports nothing storage-related anymore. It is
kept (rather than deleted) only so `import backend.api.deps` keeps
working and as a home for any genuinely per-request FastAPI dependency
that shows up later (e.g. auth/current-user extraction) -- none is needed
for storage access today.
"""
