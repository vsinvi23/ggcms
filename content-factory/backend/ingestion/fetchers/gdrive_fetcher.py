"""Google Drive source ingestion — fetches files from a shared Drive folder.

Uses a GCP Service Account JSON key (stored in GCP Secret Manager as
factory-gdrive-sa-key, injected via GDRIVE_SA_KEY env var) to authenticate
with Google Drive API v3.

Supported source types:
  - Google Docs          → exported as PDF
  - PDF files            → downloaded directly
  - DOCX files           → downloaded directly
  - Markdown / TXT       → downloaded directly

Unsupported types (spreadsheets, slides, forms) are skipped with a warning.
"""
from __future__ import annotations

import io
import json
import logging
from typing import Any

from backend.configs.settings import settings

logger = logging.getLogger(__name__)

# Google MIME types and their export/download strategy
_GOOGLE_DOC_MIME = "application/vnd.google-apps.document"
_SHEET_MIME = "application/vnd.google-apps.spreadsheet"
_SLIDES_MIME = "application/vnd.google-apps.presentation"
_PDF_MIME = "application/pdf"
_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_MD_MIMES = {"text/markdown", "text/plain"}

_EXPORT_AS_PDF = {_GOOGLE_DOC_MIME}
_SKIP_MIMES = {_SHEET_MIME, _SLIDES_MIME, "application/vnd.google-apps.form"}


def _build_service():
    """Build and return an authenticated Google Drive API service object.

    Returns None (and logs an error) if GDRIVE_SA_KEY is not configured.
    """
    try:
        from google.oauth2 import service_account  # type: ignore
        from googleapiclient.discovery import build  # type: ignore
    except ImportError:
        logger.error("google-api-python-client not installed. Run: pip install google-api-python-client google-auth")
        return None

    sa_key_raw = settings.gdrive_service_account_key
    if not sa_key_raw:
        logger.error("GDRIVE_SA_KEY env var is not configured. Cannot connect to Google Drive.")
        return None

    try:
        key_data: dict[str, Any] = json.loads(sa_key_raw)
        credentials = service_account.Credentials.from_service_account_info(
            key_data,
            scopes=["https://www.googleapis.com/auth/drive.readonly"],
        )
        service = build("drive", "v3", credentials=credentials, cache_discovery=False)
        return service
    except Exception as exc:
        logger.error("Failed to build Google Drive service: %s", exc)
        return None


def list_drive_files(folder_id: str) -> list[dict]:
    """List all supported files in a Google Drive folder.

    Args:
        folder_id: The Google Drive folder ID (extracted from the folder URL).

    Returns:
        List of dicts: [{id, name, mimeType, size (optional)}]
        Empty list on error or if Drive is not configured.
    """
    service = _build_service()
    if service is None:
        return []

    try:
        results = []
        page_token = None
        while True:
            resp = service.files().list(
                q=f"'{folder_id}' in parents and trashed = false",
                fields="nextPageToken, files(id, name, mimeType, size)",
                pageSize=100,
                pageToken=page_token,
            ).execute()

            for f in resp.get("files", []):
                mime = f.get("mimeType", "")
                if mime in _SKIP_MIMES:
                    logger.info("Skipping unsupported file type %s: %s", mime, f.get("name"))
                    continue
                results.append(f)

            page_token = resp.get("nextPageToken")
            if not page_token:
                break

        return results
    except Exception as exc:
        logger.error("Error listing Drive folder %s: %s", folder_id, exc)
        return []


def download_drive_file(file_id: str, mime_type: str) -> bytes | None:
    """Download a file from Google Drive.

    Google Docs are exported as PDF; all other supported types are downloaded
    as binary blobs.

    Returns file bytes on success, None on failure.
    """
    try:
        from googleapiclient.http import MediaIoBaseDownload  # type: ignore
    except ImportError:
        return None

    service = _build_service()
    if service is None:
        return None

    try:
        buf = io.BytesIO()
        if mime_type in _EXPORT_AS_PDF:
            # Export Google Doc → PDF
            request = service.files().export_media(
                fileId=file_id,
                mimeType=_PDF_MIME,
            )
            effective_mime = _PDF_MIME
        else:
            request = service.files().get_media(fileId=file_id)
            effective_mime = mime_type

        downloader = MediaIoBaseDownload(buf, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()

        logger.info("Downloaded Drive file %s (%s, %d bytes)", file_id, effective_mime, buf.tell())
        return buf.getvalue()
    except Exception as exc:
        logger.error("Failed to download Drive file %s: %s", file_id, exc)
        return None


async def ingest_drive_folder(project_id: str, folder_id: str) -> dict:
    """Ingest all supported files from a Google Drive folder.

    Calls the existing ingest_source() pipeline for each file so Drive content
    flows through the same extract → normalize → chunk → store pipeline as any
    other source.

    Returns a summary dict: {total, ingested, skipped, errors, files: [...]}
    """
    from backend.ingestion.pipeline import ingest_source

    files = list_drive_files(folder_id)
    if not files:
        return {"total": 0, "ingested": 0, "skipped": 0, "errors": 0, "files": []}

    total = len(files)
    ingested = skipped = errors = 0
    file_results = []

    for f in files:
        file_id = f["id"]
        name = f.get("name", file_id)
        mime_type = f.get("mimeType", "")

        # Map MIME type → content-factory source_type
        if mime_type == _PDF_MIME or mime_type in _EXPORT_AS_PDF:
            source_type = "pdf"
        elif mime_type == _DOCX_MIME:
            source_type = "docx"
        elif mime_type in _MD_MIMES:
            source_type = "txt"
        else:
            logger.warning("Skipping unsupported Drive file: %s (%s)", name, mime_type)
            skipped += 1
            file_results.append({"name": name, "status": "skipped", "reason": f"unsupported type {mime_type}"})
            continue

        file_bytes = download_drive_file(file_id, mime_type)
        if file_bytes is None:
            errors += 1
            file_results.append({"name": name, "status": "error", "reason": "download failed"})
            continue

        try:
            result = await ingest_source(
                project_id,
                source_type,
                file_bytes=file_bytes,
                title=name,
            )
            status = result.get("status", "unknown")
            if status == "ingested":
                ingested += 1
            elif status == "duplicate":
                skipped += 1
            else:
                errors += 1
            file_results.append({"name": name, "status": status, "source_id": result.get("source_id")})
        except Exception as exc:
            logger.error("Ingest failed for Drive file %s: %s", name, exc)
            errors += 1
            file_results.append({"name": name, "status": "error", "reason": str(exc)})

    return {
        "total": total,
        "ingested": ingested,
        "skipped": skipped,
        "errors": errors,
        "files": file_results,
    }


def extract_folder_id_from_url(url_or_id: str) -> str:
    """Extract a Google Drive folder ID from a URL or return as-is if already an ID.

    Supports URLs like:
      https://drive.google.com/drive/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74
      https://drive.google.com/drive/u/0/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74
    """
    import re
    match = re.search(r"/folders/([a-zA-Z0-9_-]+)", url_or_id)
    if match:
        return match.group(1)
    return url_or_id.strip()
