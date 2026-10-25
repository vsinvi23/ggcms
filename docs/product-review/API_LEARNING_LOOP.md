# Learning Loop API (backend contract for the frontend wave)

All responses use the envelope `{ "success": true, "data": ... }`; errors `{ "success": false, "message": "..." }`.
Authenticated routes need the session cookie/JWT and (for writes) the CSRF header, like the rest of `/api`.
Migration: `migrations/postgres/003_learning_loop.sql`.

## 1. Server-authoritative progress

Progress, status and completion are computed on the server from completed lessons. Client-supplied `progress` and `status: "completed"` are ignored.

### `PUT /api/enrollments/:id` (owner or admin)
Body (`data` wrapper kept for compatibility):
```json
{ "data": { "completedLessons": [{"id": 12}], "lastLessonId": 12, "status": "active|dropped" } }
```
- `completedLessons`: union-merged, idempotent. Any lesson not in the enrollment's course -> `400 "lesson does not belong to this course"` (nothing is saved).
- `lastLessonId`: must belong to the course; defaults to the last completed lesson in the request.
- `status`: only `active` / `dropped` honoured; `completed` is ignored (server decides); other values -> 400.
- `progress` is ignored.
Response: `EnrollmentResponse` `{id,status,progress,enrolledAt,lastAccessedAt,completedAt,lastLessonId,course{id,title},completedLessons[{id}]}`.
Enrollment completes (`status=completed`, `progress=100`, `completedAt`) when every lesson of the course is done AND, if `course.requireAssessmentPass`, the attached assessment has been passed.

`POST /api/enrollments` is unchanged (`{data:{course: id | {id}}}`); unknown course -> 404.

### `GET /api/enrollments/me/:courseId/resume`
```json
{ "enrollmentId": 1, "courseId": 5, "status": "active", "progress": 50,
  "totalLessons": 4, "completedCount": 2, "completedLessonIds": [10,12],
  "lastLessonId": 12,
  "nextLesson": { "id": 13, "title": "...", "type": "text", "sectionId": 3 },
  "awaitingAssessment": false, "assessmentId": null }
```
`nextLesson` = first uncompleted lesson after `lastLessonId` (wraps to the start); `null` when all lessons are done. `awaitingAssessment=true` (with `assessmentId`) means all lessons are done but a required assessment is not passed. Not enrolled -> 404.

### `POST /api/enrollments/sync-local`
Imports client-side (localStorage) progress after login; merged as a union, auto-enrols, recomputes progress.
```json
{ "items": [ { "courseId": 5, "completedLessonIds": [10, 11] } ] }
```
Limits: max 50 items, 1000 lessons per item, 5000 lessons total -> `400`. Response `data`: array of
`{courseId, accepted, rejected, progress, status, error?}`. `rejected` counts lessons not in the course; `error` is `course_not_found` (unknown/unpublished course), `enroll_failed`, `sync_failed`.

### `GET /api/learning-paths/:id/progress` (`:id` = id or slug)
```json
{ "pathId": 1, "title": "...", "totalCourses": 3, "completedCourses": 1, "progress": 44.5,
  "nextCourseId": 7,
  "courses": [ { "courseId": 5, "title": "...", "sortOrder": 0, "enrolled": true,
                 "status": "completed|active|not_started", "progress": 100, "completedAt": "RFC3339" } ] }
```
`progress` is the mean of per-course progress (not-enrolled = 0).

## 2. Assessments

Assessments are `ASSESSMENT` courses (status PUBLISHED) whose `interactiveMetadata` holds the quiz:
```json
{ "passMark": 70, "maxAttempts": 0, "revealAnswers": false,
  "questions": [ { "id": "optional", "question": "...", "options": ["a","b","c"],
                   "correctIndex": 1, "explanation": "..." } ] }
```
Also accepted: `correctIndexes: [0,2]` (multi-select, exact match required), `answer` (int, factory format), `text`/`prompt` instead of `question`. Missing `id` -> the question index as a string. Default `passMark` 70.

The public course/CMS endpoints now strip `correctIndex`, `correctIndexes`, `answer`, `correct*`, `explanation`, `rationale`, `revealAnswers` from assessment metadata. Authoring (`/api/cms`) is unchanged.

| Route | Auth | Notes |
|---|---|---|
| `GET /api/assessments/:id` | user | Definition without answers |
| `POST /api/assessments/:id/attempts` | user | Start (idempotent: returns the open attempt). `409` when `maxAttempts` reached. |
| `POST /api/assessments/:id/attempts/:attemptId/submit` | user | Score server-side |
| `GET /api/assessments/:id/attempts/me` | user | History + best score |
| `PUT /api/courses/:id/completion-requirement` | admin (audited) | `{ "assessmentId": 9, "required": true }` (`null`/`false` clears) |

Definition: `{assessmentId,title,passMark,questionCount,maxAttempts,questions:[{id,text,options[],multiple}]}`.
Start -> 201 `{attempt, assessment: Definition}`; `attempt`: `{id,assessmentId,status,score,correctCount,totalQuestions,passMark,passed,startedAt,submittedAt,durationSeconds}`.
Submit body: `{ "answers": [ { "questionId": "0", "selected": [1] } ] }` (max 500 answers, 20 selections each; unknown/duplicate question or out-of-range index -> 400; unanswered = wrong). Response: `{attempt, results:[{questionId, correct, correctIndexes?, explanation?}]}` — `correctIndexes`/`explanation` only when `revealAnswers=true`. Resubmitting -> 409.
History: `{assessmentId, passMark, attemptsUsed, bestScore, passed, attempts:[attempt...]}` (latest 50).

Passing an assessment re-evaluates enrollments of courses that require it (may complete the course and issue the certificate).

## 3. Certificates

Issued automatically once per user+course when the enrollment completes. Code is a random UUID.

### `GET /api/certificates/me`
`[ { code, courseId, courseTitle, recipientName, score, issuedAt, revoked, verifyUrl, pdfUrl, linkedInUrl } ]`
`verifyUrl` = `{FRONTEND_URL}/certificates/verify/{code}` (frontend route to build; it should call the public API below). `linkedInUrl` is the LinkedIn "Add to profile" link.

### `GET /api/certificates/:code/pdf` (owner or admin)
`application/pdf` attachment; non-owner/unknown/revoked -> 404.

### `GET /api/public/certificates/:code` (public, rate limited 30/min/IP)
`{ "valid": true, "recipientName": "...", "courseTitle": "...", "issuedAt": "...", "issuer": "GeekGully" }`
Unknown, malformed and revoked codes all return the identical `{ "valid": false }` (HTTP 200). No user id, email, score or enrollment data is exposed.

### `POST /api/certificates/:code/revoke` (admin, audited as `certificate.revoke`)
Body `{ "reason": "..." }` (required, max 500). 404 unknown, 409 already revoked.

## 4. Events and notifications
Analytics events (content type `COURSE`/`ASSESSMENT`, contentId = course/assessment id): `course_enrolled`, `lesson_completed` (metadata `lessonId`, or `count` + `source:"sync"`), `course_completed`, `quiz_attempted` (`score`, `passed`, `attemptId`), `certificate_issued`.
In-app notifications: "Course completed" and "Certificate issued" (link `/certificates`).
Both go through `internal/application/learnevents` (`Tracker`, `Notifier` interfaces, no-op defaults, async adapters over the analytics/notification services).

## 5. Schema changes
`enrollments.last_lesson_id`; `courses.assessment_id`, `courses.require_assessment_pass`; tables `assessment_attempts` (one open attempt per user+assessment), `certificates` (unique code, unique user+course).
