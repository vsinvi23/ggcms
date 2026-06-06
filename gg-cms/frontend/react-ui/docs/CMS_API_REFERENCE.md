CMS API Reference — Course & Article endpoints

Purpose
- Single-file documentation for all CMS-related endpoints (articles/courses). This is written for the integration engineer (Lovable) and contains request/response examples, field-level descriptions, expected status codes, permissions, and small usage notes for file upload/download and typical flows.

Base URL
- Default used in examples: http://localhost:8080
- All endpoints require a Bearer JWT in `Authorization` header except where noted.

Common response envelope
- All responses use the ApiResponse<T> envelope:
  {
    "success": true|false,
    "message": "Human readable message",
    "data": <payload-or-null>
  }

- On error, `success` will be false and `message` will contain a meaningful message.
- No password or sensitive fields are returned in any response.

Schemas (request and response DTOs)

CmsCreateDto (request for create / update metadata)
- type (string) - required: ARTICLE | VIDEO | COURSE
- categoryId (integer) - required
- createdBy (integer) - optional in request if caller is authenticated; server may set to authenticated user id
- title (string) - optional but recommended
- description (string) - optional

Example create body
{
  "type": "ARTICLE",
  "categoryId": 1,
  "createdBy": 4,
  "title": "Introduction to Spring",
  "description": "Short summary of the article"
}

CmsResponseDto (response payload inside ApiResponse.data)
- id (integer)
- type (string)
- categoryId (integer)
- createdBy (integer)
- reviewerId (integer|null)
- reviewerName (string|null) - helpful for UI to show reviewer
- reviewerComment (string|null)
- status (string) - DRAFT | REVIEW | PUBLISHED
- title (string|null)
- description (string|null)
- contentLocation (string|null) - storage path/identifier (not a full URL)
- contentName (string|null) - original filename
- contentType (string|null) - MIME type
- contentSize (integer|null) - bytes
- thumbnailLocation/name/type/size (same as content fields)
- createdAt, updatedAt (date-time)

Example success response (create)
{
  "success": true,
  "message": "Created",
  "data": {
    "id": 12,
    "type": "ARTICLE",
    "categoryId": 1,
    "createdBy": 4,
    "status": "DRAFT",
    "title": "Introduction to Spring",
    "description": "Short summary of the article",
    "contentLocation": null,
    "contentName": null,
    "contentType": null,
    "contentSize": null,
    "createdAt": "2025-12-24T12:34:56Z",
    "updatedAt": null
  }
}

Stored file metadata (returned after upload)
- contentLocation: server-side stored path (UUID filename or folder path). Use this value to download the file via /api/cms/{id}/content.
- contentName: original file name
- contentType: MIME type
- contentSize: bytes

---
Endpoint reference (CMS)

1) Create CMS metadata
- POST /api/cms
- Auth: Bearer (recommended). If omitted, you can pass `createdBy` but server normally uses authenticated user id.
- Request body: CmsCreateDto JSON (see schema)
- Responses:
  - 201 Created: ApiResponse<CmsResponseDto>
  - 400 Bad Request: ApiResponse (invalid inputs)
  - 401 Unauthorized: ApiResponse (if endpoint requires auth and token missing/invalid)
- Notes: This creates a CMS record in DRAFT state. contentLocation can be empty; upload file later using /{id}/upload.

2) List CMS items (paged)
- GET /api/cms?page=0&size=10
- Auth: Bearer
- Response: ApiResponse<PagedResponse<CmsResponseDto>>
- Notes: PagedResponse contains items[], totalElements, currentPage, pageSize.

3) Get CMS by id
- GET /api/cms/{id}
- Auth: Bearer
- Response: ApiResponse<CmsResponseDto>
- 404 -> ApiResponse with success=false/message="CMS not found"

4) Update metadata (title/category/type)
- PUT /api/cms/{id}
- Auth: Bearer
- Request body: CmsCreateDto (only fields present will be updated)
- Response: ApiResponse<CmsResponseDto>
- Permissions: allowed for the creator (createdBy) or users with publish permission (admins); service enforces it.

5) Delete CMS
- DELETE /api/cms/{id}
- Auth: Bearer
- Response: 204 No Content (empty) on success
- Permissions: creator or admin/publishers

6) Upload content file (HTML/video/image/PDF/doc etc.)
- POST /api/cms/{id}/upload
- Auth: Bearer
- Content-Type: multipart/form-data
- Form field: file (binary)
- Response: ApiResponse<CmsResponseDto> with contentLocation/contentName/contentType/contentSize updated
- Storage: file is saved to the configured storage (see application.properties `storage.location`). Server returns contentLocation (path) which is stored in DB.
- Note: Use POST with a form file field in Postman or curl --form. Example curl:
  curl -X POST "{{baseUrl}}/api/cms/12/upload" -H "Authorization: Bearer <token>" -F "file=@/path/to/file.mp4"

7) Download content file
- GET /api/cms/{id}/content
- Auth: Bearer
- Response: Binary stream with Content-Disposition set; Content-Type uses stored contentType when available
- Use this to serve files to UI or download attachments

8) Upload thumbnail
- POST /api/cms/{id}/thumbnail
- Auth: Bearer
- multipart/form-data; field `file`
- Response: ApiResponse<CmsResponseDto> (thumbnailLocation/name/type/size updated)

9) Get thumbnail
- GET /api/cms/{id}/thumbnail
- Auth: Bearer
- Response: Inline image binary; Content-Type set to thumbnailType

10) Submit for review
- POST /api/cms/{id}/submit
- Auth: Bearer (or provide {"userId": <id>} body)
- Body example: { "userId": 4 } (optional if auth available)
- Behavior: moves status to REVIEW and clears reviewer/comment fields
- Response: ApiResponse<CmsResponseDto>

11) Publish
- POST /api/cms/{id}/publish
- Auth: Bearer (Admin/Publisher role required)
- Body: { "userId": <id> } (optional)
- Behavior: sets status to PUBLISHED
- Response: ApiResponse<CmsResponseDto>

12) Send back to draft with comment (reviewer action)
- POST /api/cms/{id}/send-back
- Auth: Bearer (Reviewer/Admin role required)
- Body example:
  {
    "reviewerId": 5,
    "comment": "Please add references and correct typos"
  }
- Behavior: sets status to DRAFT, sets reviewerComment and reviewerId (if found), updates reviewerName in response
- Response: ApiResponse<CmsResponseDto>

---
Workflow examples (common flows for integration)

A) Authoring an article (happy path)
1. Create article metadata (POST /api/cms) -> returns id 12 (DRAFT)
2. Upload content (POST /api/cms/12/upload) -> returns CmsResponseDto with contentLocation
3. Upload thumbnail (optional)
4. Submit for review (POST /api/cms/12/submit) -> status=REVIEW
5. Reviewer checks content; if ok, reviewer or admin calls POST /api/cms/12/publish -> status=PUBLISHED
   If reviewer wants changes, reviewer calls POST /api/cms/12/send-back with comment -> status=DRAFT and reviewerComment present

B) Reviewer sending back to draft with comment
- Endpoint: POST /api/cms/{id}/send-back
- Effect: CMS.status becomes DRAFT; reviewerComment is set; createdBy remains unchanged; reviewerId/reviewerName saved
- Important: UI should display reviewerComment to the creator and allow the creator to edit and resubmit

---
Integration notes for Lovable (must read)

Authentication
- Obtain a JWT via POST /api/users/login (request body: { "email":"...","password":"..." }).
- Add header: Authorization: Bearer <token> for protected endpoints.

CORS
- Server WebConfig already allows http://localhost:4000, http://localhost:8080 and http://localhost:8081. If your frontend runs from a different origin, add it to CORS allowed origins.

File storage mapping
- Files are stored under `storage.location` (application.properties: default `./storage`), record stored in DB is `content_location` (string). To download, call GET /api/cms/{id}/content which reads the file from the storage location and returns it.
- contentLocation is not a public URL by itself; it's an internal path/identifier. Use the content download endpoint to serve files securely.

Error handling
- All errors return ApiResponse with success=false and meaningful `message` field. For DB or unexpected errors the message will include human-friendly text; integrator should display it or log it.

Permissions
- Creator (createdBy) can update metadata & upload content for their own CMS items.
- Users with publish permission (Admin-like) can publish and may update/delete as permitted.
- Reviewer actions (send-back) require review permission (for COURSE) or publish permission for ARTICLE (see service checks). The integration should rely on 403/401 responses with meaningful messages.

Postman & environment
- Use the provided `postman_collection.json` and `postman_environment.json` files in the repo.
- Typical steps for Lovable:
  1. Import collection and environment
  2. Run Register (or Login) to get token
  3. Set `authToken` environment variable (or add a small Postman test script to set it automatically from /users/login response)
  4. Run CMS requests in order: Create -> Upload -> Submit -> Publish/Send-back

Validation / edge cases
- If content file is not uploaded before submitting, server will accept submission (contentLocation may be empty) — but reviewers will likely require content; handle this in UI
- If DB migration not applied, content_location column may be non-null in older DBs. This repo includes Flyway migration V5 to add title & description — ensure migrations run.

Contact comment for Lovable (copy-paste)

Hi Lovable — below are the important details to integrate CMS endpoints:
- Base URL: http://localhost:8080
- Auth: login -> get token -> set Authorization: Bearer <token>
- All endpoints return ApiResponse { success, message, data }
- Create metadata: POST /api/cms (type, categoryId, title, description). Returns CmsResponseDto.
- Upload file: POST /api/cms/{id}/upload (multipart/form-data; field `file`). Server returns updated CMS item with content metadata.
- Download file: GET /api/cms/{id}/content
- Reviewer send-back: POST /api/cms/{id}/send-back with { reviewerId, comment } moves the item to DRAFT and stores reviewerComment — the creator must be able to edit and resubmit.

If you want, I can provide a small Postman runbook (pre-request + tests) that will automatically log in and set `authToken` for subsequent requests — tell me if you want that exported as a single Postman collection with scripts.

---
Document generated: CMS_API_DOC.md
If you'd like I will now:
- Add Postman test script to login request to auto-set `authToken` and re-export the collection, or
- Run the full smoke test (create/upload/submit/sendback/publish) and paste the concrete responses to include as final examples in this doc.

Which of these two would you like me to do next? (add Postman scripts / run smoke tests and augment doc)

---
Additional CMS file-storage details

This section documents the attachment endpoints and the delete behavior (server cleans up related files). It also summarizes how body, media and thumbnail storage works and provides sample requests.

Attachments endpoint

1) List attachments (included in CmsResponseDto)
- The `CmsResponseDto` returned by GET /api/cms/{id} contains `attachments` (array of AttachmentDto).
- Each AttachmentDto: { name, url, mimeType, size }
- URL format: /api/cms/{id}/attachments/{name}

2) Download an attachment
- GET /api/cms/{id}/attachments/{name}
- Auth: Bearer
- Response: Binary stream with appropriate Content-Type and Content-Disposition: attachment; filename="{name}"
- Example curl:
  curl -H "Authorization: Bearer <token>" "http://localhost:8080/api/cms/12/attachments/lecture1.pdf" --output lecture1.pdf

Delete CMS (Article/Course)

Endpoint behavior
- DELETE /api/cms/{id}
- Auth: Bearer
- Permissions: creator (createdBy) or users with publish/admin permission
- Server action: deletes the CMS DB row and removes all related files from storage (if present):
  - body file (relative path stored in `body_location`, e.g. articles/12/body.html)
  - content file (content_location)
  - thumbnail file (thumbnail_location)
  - attachments directory: articles/12/attachments (all files inside removed)
- Response: 204 No Content on success

Notes about storage cleanup
- FileStorageService.deleteByPath(relativePath) safely resolves the relative path against the configured `upload.base-path` (default ./uploads) and deletes the file/directory recursively.
- If files are missing or deletion fails for a particular file, the service logs/ignores individual failures but attempts to remove all related items; the DB delete proceeds.
- This behavior keeps storage in sync with DB and avoids orphaned files.

Body/media/thumbnail storage summary
- Body HTML (rich editor content): stored at relative path `articles/{id}/body.html` or `courses/{id}/body.html` and the DB `body_location` stores that relative path. Frontend should fetch body content at GET /api/cms/{id}/body (returns text/html).
- Media uploaded from the editor (images/videos) are saved under `media/{uuid}.{ext}` and are served from /api/media/{filename}. The upload endpoint returns a JSON with `url` field to be inserted into HTML (e.g. <img src="/api/media/...">).
- Thumbnails are stored as `articles/{id}/thumbnail.{ext}` or `courses/{id}/thumbnail.{ext}` and served via GET /api/cms/{id}/thumbnail.
- Attachments are stored under `articles/{id}/attachments/{name}` and served via GET /api/cms/{id}/attachments/{name}.

Configuration
- application.properties (example keys)
  upload.base-path=./uploads
  upload.max-file-size=50MB
  upload.allowed-image-types=image/jpeg,image/png,image/gif,image/webp
  upload.allowed-video-types=video/mp4,video/webm
  upload.allowed-document-types=application/pdf,text/html

Security & validation recommendations
- Validate uploaded file types server-side using MIME type checks and allowed lists.
- Sanitize inline HTML before saving to prevent XSS (use a library like jsoup to whitelist elements/attributes).
- Limit file sizes using the `upload.max-file-size` property and reject files larger than the configured size.
- Ensure Authorization: Bearer <token> header is required; the controllers call `extractCurrentUserId()` to infer the acting user.

Complete endpoint reference (concise)
- POST /api/media/upload (multipart file) -> returns { success, message, data: { url, filename, size, mimeType } }
- GET /api/media/{filename} -> serves binary media with Content-Type
- POST /api/cms/{id}/body -> multipart file (HTML) or JSON { content: "<html>..." } -> returns ApiResponse<CmsResponseDto>
- GET /api/cms/{id}/body -> returns HTML (text/html)
- POST /api/cms/{id}/upload -> multipart file attachment -> returns ApiResponse<CmsResponseDto> (contentLocation stored relative path)
- GET /api/cms/{id}/content -> streams content file (attachment) — if you uploaded via /upload this will return the file
- POST /api/cms/{id}/thumbnail -> upload thumbnail image -> returns ApiResponse<CmsResponseDto>
- GET /api/cms/{id}/thumbnail -> returns image binary
- GET /api/cms/{id}/attachments/{name} -> download named attachment
- DELETE /api/cms/{id} -> delete cms record and remove all related files from storage

Integration checklist for Lovable (copy-paste)
1. Import Postman collection & environment.
2. Login and set Authorization header.
3. Create article/course (POST /api/cms).
4. Upload the body (POST /api/cms/{id}/body) or send inline HTML.
5. Upload images via POST /api/media/upload, insert returned URL into the HTML content.
6. Upload attachments via POST /api/cms/{id}/upload.
7. Submit for review, reviewer actions, publish.
8. To remove a CMS and its files: DELETE /api/cms/{id} (ensure admin/creator permissions).

---

