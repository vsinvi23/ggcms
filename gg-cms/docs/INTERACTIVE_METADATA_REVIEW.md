# interactiveMetadata Review: Interview Prep & Practice

Living document. Part 1 is the code-level review (static read, 2026-10-05, nothing executed).
Part 2 is the feedback log, filled in while testing uploaded content on a local deployment.

Legend: **[V]** verified in code by a direct read. **[A]** reported by a review agent, not re-read, so confirm before acting.

---

## 1. Code-level review

### 1.1 How the feature is modelled

- Interview Prep and Practice have **no tables of their own**. Both are `courses` rows with `course_type = 'ASSESSMENT'`. The sub-type lives inside a free-form JSON column. [V]
- Column: `interactive_metadata jsonb`, on both `articles` and `courses` (`entity/cms.go:61,101`). [V]
- Discriminator is a key inside the JSON, not a column: `assessmentType = "PRACTICE" | "INTERVIEW"`. [V] (`PracticeHub.tsx:116-119`, `InterviewPrepHub.tsx:216-219`)
- A separate concept also exists: `learning_paths.kind = 'INTERVIEW_PREP'`. The hubs do not use it, so there are **two competing models of "interview prep"**. [A]
- No questions, options, attempts, scores or per-lesson progress tables exist. Quiz lessons are only a `type` string. Practice answers are held in React state (`practiceAnswers`) and are not persisted. [A]

### 1.2 Contract as the code implies it (no schema is defined anywhere)

```json
{
  "assessmentType": "PRACTICE | INTERVIEW",
  "contentType": "MCQ",
  "questions": [
    { "options": ["..", "..", "..", ".."], "correctIndex": 0 }
  ]
}
```

Source: the placeholder text in `AssessmentCreator.tsx:530-537`. Only these keys are read:

| Consumer | Reads | Notes |
|---|---|---|
| PracticeHub | `assessmentType === 'PRACTICE'`, `questions[]` | Falls back to `generateQuestionsForSlug(...)` if `questions` is absent |
| InterviewPrepHub | `assessmentType === 'INTERVIEW'` only | **Questions are not read from the metadata.** They are regex-parsed out of the article/course *body* (`Q1:`, `### Question`, `Think prompt:`, `Mistake:`, `Related concepts:`) at `InterviewPrepHub.tsx:93-140` |
| CourseViewPage (practice runner) | `questions[i].options`; also tries JSON inside lesson content | Falls back to **hard-coded placeholder options** (`CourseViewPage.tsx:~825-830`) |

`correctIndex` is shown in the placeholder. I did not find the scoring path that uses it. Confirm during testing.

### 1.3 Findings

#### Critical

**M1. The editor cannot save the field. [V]**
`AssessmentCreator.tsx:181,183` sends `interactiveMetadata` on create and update. But `CreateCMSRequest` and `UpdateCMSRequest` in `dto/cms_dto.go` have **no such field**; the only occurrence in that file is the *response* struct (line 21). Gin drops unknown JSON keys silently, so the request returns success and nothing is stored. The service layer supports it (`service.go:235,264,345,426`); the DTO and handler mapping (`cms_handler.go:145-158, 231-243`) are missing.
Consequence: today the only way to populate it is the **bulk importer**. Anything typed into the "Interactive Metadata (JSON)" box is lost.
Fix: add `InteractiveMetadata *string json:"interactiveMetadata,omitempty"` to both request DTOs and pass it through in the handler.

**M2. Placeholder or generated content appears when metadata is missing or malformed. [V]**
- PracticeHub: no `questions` -> `generateQuestionsForSlug()` produces generated questions, and `questionsCount: questions.length || 4`.
- CourseViewPage: no matching question -> four hard-coded placeholder options are shown.
- InterviewPrepHub: `round: idx % 2 === 0 ? 'System Design' : 'Technical'` is invented from list position, and `difficulty` defaults to `'Senior'`, `estimatedHours` to `8`.
A reviewer cannot tell uploaded content from fabricated filler. For this test run, treat any text you did not upload as a bug.

#### High

**M3. No validation anywhere. [V/A]**
- The column is `jsonb`, so invalid JSON should make the write fail (the importer passes the raw string; `"null"` is skipped, `import_handler.go:334-335`). [A] No friendly error is expected. Confirm what the user sees.
- No schema check: missing `assessmentType`, a wrong enum value, `correctIndex` out of range, or fewer than 2 options are all accepted. A wrong or missing `assessmentType` makes the item **disappear from both hubs without any error**, because the filter returns false (`PracticeHub.tsx:122`, `InterviewPrepHub.tsx:222`).
- The frontend swallows parse errors (`catch(e) {}`), so a malformed record just vanishes.

**M4. The field cannot be cleared via the API. [A]**
The update path uses a pointer with "nil = no change". Once set, it cannot be removed through the normal update endpoint.

**M5. The importer is the only writer, and it has gaps. [A]**
- Overwriting an existing course appends all sections and lessons again, so every re-upload duplicates them.
- Markdown/HTML bodies are stored with `content_format = blocks` (importer does not carry the body format). This matters for Interview Prep, whose questions are parsed from the body text.
- The imported slug is not persisted, so re-import "exists" detection can mismatch and create duplicates.
- Create and Overwrite are not transactional, so a failure partway leaves a half-built course.
- Tags in the file are parsed but never saved.

**M6. Interview Prep depends on fragile text parsing. [V]**
Questions are split with a regex on `Q1:`, `Question 1`, `### Question`. Different wording means zero questions. There is no structured alternative in the metadata even though `questions[]` is the natural place for it.

**M7. Public leakage. [A]**
Anonymous `?preview=true` on the public detail endpoints returns unpublished content, including `interactiveMetadata` (which may contain answer keys). Public `/api/sections` is also unauthenticated. Answer keys (`correctIndex`) are sent to the browser for every published assessment by design, so a learner can read the answers from the network response. Fine for practice; a problem for any graded use.

#### Medium

**M8. Answers and progress are not persisted. [A]** No attempts, scores, streaks or completion for practice or interview prep. MyLearning cannot show them.

**M9. Hub list is client-side filtered over a capped page (size 50). [A]** Assessments beyond the cap never appear, and the `assessmentType` filter is applied in the browser rather than in SQL, so it can never be indexed. The `jsonb` column has no GIN index.

**M10. Category / role / topic mapping is loose. [V]** `role` is the category name cast to a type, `topicSlug` is `tags?.[0]` or the slug. Tags are not stored on content (see the main review), so `topicSlug` effectively falls back to the slug.

### 1.4 Recommended direction

1. Fix M1 first. Without it nothing entered in the UI persists.
2. Add server-side validation for `interactiveMetadata` (JSON Schema, enum for `assessmentType`, 2+ options, `correctIndex` in range) with clear 400 errors.
3. Move Interview Prep questions into `questions[]` too (fields: `question`, `answer`, `hint`, `commonMistakes`, `relatedConcepts`, `relatedCourses`) and stop parsing the body.
4. Remove generated/placeholder fallbacks and show an explicit "no questions" state instead.
5. Decide whether this needs real tables (`assessment_questions`, `assessment_attempts`) before it grows. Check this once real content volume is known.
6. Filter on `assessmentType` in the backend (expression index on `(interactive_metadata->>'assessmentType')`) and paginate.

---

## 2. Feedback log

Environment: local deployment, no sample content loaded. Seed data in the migration is configuration and is kept as is.

### 2.1 Test run

| Field | Value |
|---|---|
| Date | |
| Build / commit | |
| Content uploaded (file names, count) | |
| Upload method (Bulk Import / editor / API) | |

### 2.2 Checklist

| # | Check | Result (Pass / Fail / N/A) | Notes |
|---|---|---|---|
| 1 | Upload via Bulk Import succeeds and preview shows `interactiveMetadata` | | |
| 2 | Imported assessment appears in Admin Content Overview with the right type | | |
| 3 | Open item in editor: metadata box shows the uploaded JSON | | |
| 4 | Edit metadata in editor and save, then reopen (expect FAIL until M1 is fixed) | | |
| 5 | Item appears in Practice Hub (`assessmentType=PRACTICE`) | | |
| 6 | Item appears in Interview Prep Hub (`assessmentType=INTERVIEW`) | | |
| 7 | Question count, options and correct answer match the upload | | |
| 8 | No text appears that was not in the upload (generated or placeholder content) | | |
| 9 | Interview questions parsed correctly from the body (count and fields) | | |
| 10 | Re-uploading the same file does not duplicate sections or items | | |
| 11 | Malformed JSON gives a clear error, not a silent disappearance | | |
| 12 | Draft item is not visible to anonymous users (with and without `?preview=true`) | | |
| 13 | Practice answers / score survive a page reload (expect not) | | |

### 2.3 Issues and comments

| ID | Section (Practice / Interview / Importer / Editor / API) | Description | Expected | Actual | Severity | Related finding | Status |
|---|---|---|---|---|---|---|---|
| F-001 | | | | | | | Open |

### 2.4 Sample uploaded metadata (paste anonymised examples that misbehaved)

```json

```

### 2.5 Decisions

| Date | Decision | Owner |
|---|---|---|
| | | |
