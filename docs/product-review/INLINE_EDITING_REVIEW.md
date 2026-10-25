# Inline Editing Review (Articles and Courses)

Status: review complete, no product code changed, nothing committed.
Branch: `feat/platform-hardening-learning-loop-ai`
Code root: `gg-cms/` (frontend in `gg-cms/frontend/react-ui`, backend in `gg-cms/backend/go-cms`).
Paths below are relative to `gocms/`.

Symptom from the product owner: "inline editing is not working as expected".

## 1. Summary

The feature has three separate failure modes, and they combine:

1. **Saves can silently overwrite the wrong data.** The inline editor copies its initial text once, at mount (`InlinePageEditor.tsx:52-54`). The page mounts it before the pending draft and the body have loaded. Saving then writes the published text, or an empty body, over the pending revision (DEF-02). Navigating to another item while the editor is open saves the old item's text into the new one (DEF-03). When the body is empty, the editor is seeded with the summary text (DEF-13).
2. **The UI promises things the backend or the page does not deliver.** The "Switch to Live Published View" button only changes its label (DEF-05). The revision-author banner can never show, because the page reads an `updatedBy` field the backend does not send (DEF-07). Non-author quick-edit users see unapproved drafts as the page content (DEF-06). Users who can see Edit get a 403 on Save when they did not create the content (DEF-08). After a save, the public page keeps showing stale state, because the update invalidates `cms` query keys while public data lives under `public-cms` (DEF-04).
3. **Data-model and security gaps on the backend.** The public projection serves unpublished draft body and description to anonymous visitors when the published snapshot is NULL (DEF-01). Edits to content in REVIEW or APPROVED keep that status, so unreviewed text can be approved or published (DEF-12). Concurrent saves are last-writer-wins (DEF-14).

Counts: 21 defects (3 critical, 8 high, 6 medium, 4 low). Automated demonstrations: 9 frontend test cases and 4 Go test functions (two with subtests), all written to fail against current code (section 6).

Critical items to fix first: DEF-01, DEF-02, DEF-03.

## 2. How the feature is wired (for reviewers)

| Layer | Piece | Location |
|---|---|---|
| Entry point | Article page renders editor and quick-edit bar | `gg-cms/frontend/react-ui/src/pages/PublicArticleView.tsx:470-496` |
| Entry point | Course page renders editor and quick-edit bar | `gg-cms/frontend/react-ui/src/pages/CourseViewPage.tsx:662-688` |
| Full-width inline editor (plain textarea, not contentEditable) | `InlinePageEditor` | `gg-cms/frontend/react-ui/src/components/editor/InlinePageEditor.tsx` |
| Drawer and "Inline Canvas Edit" button | `PublicQuickEditBar` | `gg-cms/frontend/react-ui/src/components/editor/PublicQuickEditBar.tsx` |
| Permission flag (UI only) | `canQuickEditPublic` = master admin OR any group with `publicQuickEdit` | `gg-cms/frontend/react-ui/src/contexts/AuthContext.tsx:325-331` |
| Draft read (authenticated) | `useCmsById` for pending draft | `PublicArticleView.tsx:148-152`, `CourseViewPage.tsx:256-262` |
| Public read | `usePublicCmsById`, `usePublicCmsBody` | `gg-cms/frontend/react-ui/src/api/hooks/usePublicCms.ts:28-51` |
| Save | `handleSaveArticleRevision`, `handleSaveCourseRevision` (update, then optional submit) | `PublicArticleView.tsx:154-175`, `CourseViewPage.tsx:214-236` |
| Backend update | `CMSHandler.Update` (owner-or-admin check) | `gg-cms/backend/go-cms/internal/interfaces/http/handler/cms_handler.go:215-276` |
| Backend revision logic | `service.Update` (snapshot on PUBLISHED, sets DRAFT and `has_pending_draft`) | `gg-cms/backend/go-cms/internal/application/cms/service.go:286-448` |
| Backend publish | `service.Publish` (clears snapshot) | `service.go:667-712` |
| Public projection | `articleToPublicCMS`, `courseToPublicCMS` | `gg-cms/backend/go-cms/internal/interfaces/http/handler/public_handler.go:344-390` |
| Render-time sanitiser | `sanitizeHtml` (DOMPurify allowlist) | `gg-cms/frontend/react-ui/src/lib/sanitize.ts` |

Editor libraries: the inline path uses a plain `<textarea>`. There is no contentEditable, Quill, or TipTap in that path. TipTap (`@tiptap/*` in `gg-cms/frontend/react-ui/package.json`) is used only by the full creator when `contentFormat === 'tiptap'`. Body formats are `blocks` (JSON ContentBlock array, the default for new articles), `html`, and `tiptap` (`src/types/content.ts:7`).

`ArticleCreator.tsx` and `CourseCreator.tsx` have no inline mode. They only show diff-view spans (`ArticleCreator.tsx:672`, `CourseCreator.tsx:559`). Their Save path calls `updateCms` and then `uploadBody`, which is itself a plain `update` call (`api/services/cmsService.ts:360-363`). That goes through the same snapshot logic, so it is not a bypass.

## 3. Symptom to root-cause table

| Symptom reported or observed | Root cause | Defect IDs |
|---|---|---|
| Saved inline edit reverts the pending revision or the body to published text | Editor state seeded once at mount, before draft and body queries resolve | DEF-02 |
| Body became empty, or became the summary text, after inline save | Editor seeded with `''` or with `getBody` fallback to `description` | DEF-02, DEF-13 |
| Edited article A's text appears in article B | No `key` or reset on item change; `isInlineEditing` not reset | DEF-03 |
| After "Submit for Review", banner, diff and toggle do not appear until refresh | Public queries (`public-cms`) not invalidated on save | DEF-04 |
| "Switch to Live Published View" changes the label but not the content | `isViewingPending` is never read by the page | DEF-05 |
| Author never sees their own pending revision banner | `pendingDraftAuthorId` reads `updatedBy`, which the backend never sends | DEF-07 |
| Non-author quick-edit users see draft text on the public page with no indicator | Draft fetched and displayed for all `canQuickEditPublic` users | DEF-06 |
| Edit button shown, Save fails with 403 "cannot edit content you do not own" | Permission in UI is a group flag; backend allows only owner or admin | DEF-08 |
| Bold or Heading button breaks a block-format article (text shown as raw JSON) | Editor allows `blocks` format; toolbar appends HTML to JSON | DEF-09 |
| Headings, underline, superscript typed in the editor disappear on the public page | Render-time allowlist (no `h5`, `h6`, `u`, `sup`, `sub`, ...) | DEF-10 |
| Bold, Italic and Code Block insert text at the end, not at the cursor | Toolbar appends to the end of `body`; no selection handling | DEF-11 |
| Edits to content under review are approved or published without re-review | `service.Update` ignores status | DEF-12 |
| Unpublished draft body visible to anonymous visitors | `articleToPublicCMS` only replaces body and description when snapshot is non-NULL | DEF-01 |
| Lost edits on Cancel or navigation | No dirty-state guard; Cancel discards silently | DEF-15 |
| Revision saved but "Failed" shown | Update and submit run as two calls with no compensation | DEF-16 |
| Overwritten edits when two people save | Full-row GORM `Save`, no version check | DEF-14 |

## 4. Severity scale

- **Critical**: silent data loss or overwrite, or unpublished content exposed to the public.
- **High**: user-visible wrong state or permission mismatch, or a control that does nothing.
- **Medium**: confusing behaviour, or a gap that becomes data loss under plausible conditions.
- **Low**: copy, cosmetics, or unreachable-today code paths.

## 5. Defect register

Each entry gives location, evidence, reproduction, proposed fix, and the test that demonstrates it (if any).

### DEF-01 Public projection leaks unpublished draft content (Critical, backend)

- **Where:** `gg-cms/backend/go-cms/internal/interfaces/http/handler/public_handler.go:344-362` (`articleToPublicCMS`), `:364` (`courseToPublicCMS`). The body and description are replaced only inside `if a.PublishedBody != nil` (line 351), `if a.PublishedDescription != nil` (line 348), and `if c.PublishedBody != nil` (line 375). If the snapshot is NULL, the draft field stays in the response.
- **Why it happens:** `service.Update` copies `Body` into `PublishedBody` only on the first edit of PUBLISHED content (`service.go:387`). Content published with no body or no description, then edited, has a NULL snapshot, so the draft text becomes publicly readable through `GET /public/articles/:id` and `GET /public/courses/:id`.
- **Repro:** Create an article with no body, publish it, then Inline Edit and enter body text, then Save Draft. Open the page in a private window. The unpublished body is in the public JSON response (`body`).
- **Fix:** When `HasPendingDraft` is true, always replace `Title`, `Description` and `Body` with the snapshot values, using empty string or null when the snapshot is NULL. Add a regression test per content type (done, see section 6).
- **Test:** `TestDEF01_ArticlePublicView_PendingDraftWithoutSnapshot_DoesNotLeakDraft`, `TestDEF01_CoursePublicView_PendingDraftWithoutSnapshot_DoesNotLeakDraft` (fail today).

### DEF-02 Inline editor overwrites the pending revision or body with stale or empty data (Critical, frontend)

- **Where:** `InlinePageEditor.tsx:52-54` (`useState(initialTitle | initialDescription | initialBody)` with no resync). The editor is always mounted without a `key` (`PublicArticleView.tsx:470-480`, `CourseViewPage.tsx:662-672`). `draftArticle` / `draftCourse` only starts loading after the article has rendered (`PublicArticleView.tsx:148-152`). `bodyHtml` is fetched separately (`PublicArticleView.tsx:113`), and the page renders before it arrives.
- **Evidence:** The editor's first render therefore uses published values, or `''` for the body. After the draft arrives, the state does not change. Save then sends `body: ''` or the published body. `service.Update` treats `req.Body != nil` as an overwrite (`service.go:417-418`), and a pointer to `""` is non-nil, so the body is emptied.
- **Repro:** (1) Article with a pending revision. Load the page as a quick-edit user, click Inline Canvas Edit immediately, and observe the title and body are the published text. (2) Click Save Draft. The pending revision is replaced by published content. (3) For an article with no published body yet, the textarea starts empty and Save wipes the body.
- **Fix:** Do not mount the editor until `draft` and `body` queries have settled (gate on `isLoading`). Or add `key={`${contentId}:${draft?.version ?? 0}:${loadedAt}`}` so the editor remounts when data changes. Disable the Inline Canvas Edit button until then. Never send a body the user has not seen.
- **Test:** `InlinePageEditor.defects.test.tsx` "DEF-02: shows the server body when it arrives after the editor mounted" and "DEF-02: saving after the late body arrives sends the real body, not an empty string" (both fail today).

### DEF-03 Editor keeps the previous item's text on navigation (Critical, frontend)

- **Where:** `PublicArticleView.tsx:91-92` and `CourseViewPage.tsx:207-208` hold `isInlineEditing` in component state with no reset on `articleId` / `courseId`. The route is `"/article/*"` and `"/course/*"` with no key (`App.tsx:180-181`). React Router keeps the same element instance when only the wildcard changes. `handleSaveArticleRevision` saves to `article?.id` (current item) but uses the editor's `data`, which holds the previous item's text (`PublicArticleView.tsx:154-165`).
- **Repro:** Open article A, click Inline Canvas Edit, and before saving use browser Back, Forward, or any in-app link to article B. The editor is still open with A's title and body. Click Save Draft. B now has A's body, and A is unchanged.
- **Fix:** Key the page subtree by item id (`<PublicArticleView key={articleId} />` or a `key` on the editor and bar). Also reset `isInlineEditing` and `isViewingPending` when the id changes, and close the editor on route change.
- **Test:** `InlinePageEditor.defects.test.tsx` "DEF-03: switching to a different item while open does not keep the previous item text" (fails today). The route-level reproduction is not automated; see section 7.

### DEF-04 Public view stays stale after a save (High, frontend)

- **Where:** `api/hooks/useCms.ts:74-84` (`useUpdateCms`) invalidates `cmsKeys.detail(id)` and `cmsKeys.all` (`['cms', ...]`). Public article and body queries use `publicCmsKeys` = `['public-cms', ...]` (`api/hooks/usePublicCms.ts:5-10`) with `staleTime: 0` (`:28-51`). After Save Draft, the public article still reports `hasPendingDraft=false`, so the revision banner, the diff overlay, and the toggle do not appear. The page only refreshes on remount or window focus.
- **Fix:** In `useUpdateCms`, `useSubmitCmsForReview`, `usePublishCms` and the reject and approve hooks, also invalidate `publicCmsKeys.all`. Alternatively, `setQueryData` from the mutation response.
- **Test:** Not automated. Proposed integration test: seed a QueryClient with `['public-cms', '1']`, run the mutation, and assert the public key is invalidated.

### DEF-05 "Switch view" button does nothing to content (High, frontend)

- **Where:** `PublicArticleView.tsx:91`, `:173`, `:492-493`; `CourseViewPage.tsx:207`, `:233`, `:684-685`. `isViewingPending` is passed to the bar and used only to pick the button label (`PublicQuickEditBar.tsx:128-132`). The displayed title, description and body are chosen by `diffViewMode` (`PublicArticleView.tsx:93`, `:209-211`, `:460-465`), so the button never changes what is shown.
- **Repro:** Quick-edit user, page with a pending revision. Click "Switch to Live Published View". The label changes and the content does not.
- **Fix:** Use one state for the view (`'published' | 'draft' | 'diff'`). Have the bar call `setDiffViewMode` and drive the displayed text from it. Remove the separate `isViewingPending` state.

### DEF-06 Unapproved draft shown to non-author quick-edit users (High, policy and permission)

- **Where:** `PublicArticleView.tsx:148-152` fetches the draft for any `canQuickEditPublic` user. `diffViewMode` defaults to `'diff'` (`:93`), and `activeTitle`, `activeDescription` and `activeBody` use the draft whenever `diffViewMode` is draft or diff, with no author or admin check (`:209-211`, `:460-465`). The banner copy says the draft is visible "only to you and Master Admin" (`PublicQuickEditBar.tsx:231`).
- **Impact:** A quick-edit group member who did not author the revision sees the unapproved text as the page content, with no indicator that it is a draft. The diff overlay is hidden for them (`PublicArticleView.tsx:500` uses `isAdmin || isMasterAdmin`).
- **Fix:** Confirm the policy with the product owner. Then gate the draft fetch and the draft display on `isMasterAdmin || isAuthor`. For other editors, show the live version with a clear "pending review by someone else" note.

### DEF-07 Revision author is never identified, so the author banner never shows (High, contract)

- **Where:** `PublicArticleView.tsx:491` and `CourseViewPage.tsx:683` pass `draftArticle?.updatedBy` / `draftCourse?.updatedBy`. `updatedBy` is declared in `src/api/types.ts:298` but the backend has no such field: it is absent from the `Article` and `Course` entities and from `dto.CMSResponse` (`internal/interfaces/http/dto/cms_dto.go:11-…`). The value is always `undefined`, so `isRevisionAuthor` is always false (`PublicQuickEditBar.tsx:71-72`).
- **Impact:** A non-master editor who made a revision never sees the "Version Request" banner or the switch control for their own revision.
- **Fix:** Expose the last editor (`updatedBy` or `lastEditedBy`) from the backend, from the last EDIT workflow event, or from a new column. Or use the author from the workflow events on the frontend.
- **Test:** `TestDEF07_CMSResponse_CarriesRevisionAuthorField` (fails today).

### DEF-08 UI grants inline editing to users the API will reject (High, permission mismatch)

- **UI side:** `AuthContext.tsx:327-331` makes `canQuickEditPublic` true for master admins or any group with `publicQuickEdit.enabled`. Both pages show the edit controls for that flag (`PublicArticleView.tsx:470-496`, `CourseViewPage.tsx:662-688`). The editor also labels every such user "Super Admin Privileged" (`InlinePageEditor.tsx:125-127`).
- **API side:** The backend has no concept of `publicQuickEdit`. A grep of `backend/go-cms` for `quick` returns nothing. `CMSHandler.Update` lets only the owner or an admin edit (`cms_handler.go:223-239`), and existing test `TestCMSUpdate_NonOwner_Forbidden` enforces this. So a group member who is not the owner can open the editor, click Save, and get a 403 (the toast shows the generic axios error text).
- **Asymmetry:** `CMSHandler.Submit` has no ownership check (`cms_handler.go:324-338`, route `router.go:460`), so the submit side and the update side disagree about who may act on content.
- **Fix:** Pick one rule and enforce it in both places. Either the backend honours `publicQuickEdit` in `Update` and `Submit` (preferred if the group feature is real), or the UI gates on owner or admin. Make the badge text depend on the actual role.

### DEF-09 Block-format articles corrupted by the toolbar (High, data integrity)

- **Where:** `InlinePageEditor.tsx:75-91` appends `<b>`, `<i>`, `<h2>`, `<code>`, `<ul>` to whatever body string is in the textarea. The editor blocks only `contentFormat === 'tiptap'` (`:62`). Most new articles use `blocks` (`ArticleCreator.tsx:235-236` stores `JSON.stringify(contentBlocks)`).
- **Consequence:** The textarea shows raw JSON. Clicking a tool appends HTML, which makes the JSON invalid. `parseBodyToHtml` then falls back to returning the raw text (`lib/htmlParser.ts:13-24`), so the public page shows the JSON and HTML as text.
- **Fix:** Refuse inline editing for `blocks` as well as `tiptap`, with a link to the full editor. For HTML and Markdown only, keep the textarea. On the backend, validate on update that `blocks` bodies parse as a JSON array and `tiptap` bodies as a JSON document.
- **Test:** `InlinePageEditor.defects.test.tsx` "DEF-06: the Bold tool does not corrupt a JSON-blocks body" (fails today; parse error is "Unexpected non-whitespace character after JSON").

### DEF-10 Render sanitiser silently strips markup the editor accepts (Medium, rendering)

- **Where:** `gg-cms/frontend/react-ui/src/lib/sanitize.ts:3-14` (`ALLOWED_TAGS`) has no `h5`, `h6`, `u`, `s`, `del`, `ins`, `sup`, `sub`, `mark`, `kbd`, `small`, `caption`, `col`, `colgroup`, `dl`, `dt`, `dd`. `ALLOWED_ATTR` (`:16-23`) has no `style`, `scope`, `loading`, `lang`, `dir`. Output keeps the text but drops the element, so the user loses formatting with no warning. The block renderer emits only h1 to h3 (`htmlParser.ts:475-479`), so this affects hand-typed or legacy HTML, not block content.
- **Also:** The backend never sanitises on save (`grep -rni sanitiz backend/go-cms/internal` finds nothing for article bodies). Stored bodies are raw HTML, and only the browser sanitises at render. Any other consumer of `body` (GraphQL, exports, SEO) gets unsanitised content.
- **Fix:** Extend the allowlist for the tags the editor documents. Add a live preview in the editor using the same `sanitizeHtml`, so the author sees what the public sees. Add a server-side sanitiser on write (bluemonday or equivalent) with the same allowlist.
- **Test:** `src/lib/sanitize.inlineEditing.defects.test.ts` (3 tests, fail today).

### DEF-11 Toolbar ignores the cursor and inserts placeholder text (Medium, UX)

- **Where:** `InlinePageEditor.tsx:89` appends to the end of `body` and inserts the literal "New content block". Bold and Italic do not wrap the selection. "Code Block" (`:158-160`, `:81-83`) inserts inline `<code>`, not `<pre><code>`, so it does not create a block.
- **Fix:** Use `selectionStart` and `selectionEnd` of the textarea to wrap the selection. Insert `<pre><code class="language-…">` for the code block, and move the caret into the inserted content.

### DEF-12 Content under review or approved can be edited without re-review (High, workflow)

- **Where:** `service.go:286-448` (`Update`) never checks status. For REVIEW or APPROVED content it changes the body and keeps the status (see the snapshot branch at `:377`, which only applies to PUBLISHED). `Approve` and `Publish` then act on text that no reviewer saw.
- **Repro:** Submit an article for review. Before the reviewer acts, edit the body inline and save. The status stays REVIEW, and the reviewer's approval applies to the new text.
- **Fix:** When content is in REVIEW or APPROVED and a body or title changes, either reject with 409 and a message, or move it to DRAFT, clear the reviewer, and record an event. The editor should show a clear warning before save.
- **Test:** `TestDEF12_EditingContentUnderReviewDoesNotKeepItReviewable` (REVIEW and APPROVED subtests, both fail today).

### DEF-13 Editor body seeded with the summary when the article has no body (High, data integrity)

- **Where:** `api/services/publicCmsService.ts:212-221` (`getBody`) returns `item.body || item.content || item.description || item.excerpt || ''`. The page passes `bodyHtml` as the editor's body fallback (`PublicArticleView.tsx:475`, `:487`; `CourseViewPage.tsx:669`). For an article with an empty body, the textarea starts with the description, and Save Draft writes the description into `body`.
- **Fix:** Use the authenticated `draftArticle.body` or a raw-body endpoint for editing, and never the public fallback chain. Keep the fallback for display only.
- **Test:** `src/api/services/publicCmsService.inlineEditing.defects.test.ts` (fails today: returns the summary).

### DEF-14 Concurrent saves are last-writer-wins (Medium, backend)

- **Where:** `service.Update` reads the whole entity, mutates it, and calls `articleRepo.Update` (`service.go:369-446`), which uses GORM `Save` over the full row (`infrastructure/persistence/postgres/article_repository.go:37-41`). `Version++` is incremented but never checked, and the request DTO has no version (`dto/cms_dto.go:74-87`).
- **Impact:** Two editors, or an editor and a publisher, can overwrite each other. A publish between the read and the save can be reverted to DRAFT with `has_pending_draft` cleared or set incorrectly.
- **Fix:** Send the version the user loaded. Use `UPDATE ... WHERE id=? AND version=?` (or `Updates` with a column list). Return 409 on mismatch and show "changed by someone else since you opened this". Do not use full-row `Save` for this path.

### DEF-15 Cancel and navigation discard edits without warning (Medium, UX)

- **Where:** `InlinePageEditor.tsx:177-184` (Cancel calls `onClose` directly). No dirty tracking, no `beforeunload`, and no route guard. `PublicQuickEditBar.tsx:74-79` resets the drawer on open, which is correct, but the inline editor has no equivalent guard.
- **Test:** `InlinePageEditor.defects.test.tsx` "DEF-09: Cancel with unsaved edits asks for confirmation before discarding" (fails today).
- **Fix:** Track dirty state against the loaded values. Confirm on Cancel and on route change. Add `beforeunload` while dirty. Autosave to a server draft is the better long-term fix (see section 7).

### DEF-16 Save and submit are not atomic (Medium, frontend and backend)

- **Where:** `PublicArticleView.tsx:154-175` and `CourseViewPage.tsx:214-236` call `updateCms.mutateAsync` and then `submitForReview.mutateAsync`. If the second call fails, the draft is saved but the user sees "Failed to save", and `setIsViewingPending(true)` is not reached.
- **Fix:** Add a backend "save and submit" endpoint, or show "Saved as draft, but submission failed. Retry submit." with a separate retry button.

### DEF-17 Course save can report success without saving (Low, frontend)

- **Where:** `CourseViewPage.tsx:215` guards with `if (numericCourseId)`, but then still sets `isViewingPending` and resolves, so the toast says "Draft revision saved". The editor uses `contentId={numericCourseId || 1}` (`CourseViewPage.tsx:664`, `:675`). This is unreachable today, because the editor only renders after `displayCourse` exists (`CourseViewPage.tsx:~661`), but the guard hides a future bug.
- **Fix:** Throw when the id is missing. Do not show success.

### DEF-18 Backend returns 500 for every update error (Low, backend)

- **Where:** `cms_handler.go:266-269` maps every error from `service.Update` to `InternalError`, including "article not found" (`service.go:370-372`). The client sees a 500 and the raw message.
- **Fix:** Map not-found to 404, validation to 400, and conflicts (DEF-14) to 409.

### DEF-19 Status copy references a status that does not exist (Low, copy)

- **Where:** `PublicQuickEditBar.tsx:184` says edits are saved as "`DRAFT` or `SUBMITTED_FOR_REVIEW`". The status type is `DRAFT | REVIEW | APPROVED | PUBLISHED | REJECTED` (`src/api/types.ts:216`). "Draft revision saved successfully!" (`InlinePageEditor.tsx:105`) also appears when the content has no live version yet.
- **Fix:** Use the real status names. Say "Saved as draft" when the item has never been published, and "Saved as pending revision" when it has.

### DEF-20 No tests for the inline feature (Medium, quality)

- No unit test exists for `InlinePageEditor`, `PublicQuickEditBar`, `handleSaveArticleRevision` or `handleSaveCourseRevision`. A grep of `frontend/react-ui/e2e/specs` finds no inline or quick-edit spec.
- Backend: no test for the public masking of pending drafts before this review, and no test for editing REVIEW or APPROVED content.
- Note: `CourseViewPage.test.tsx` and `CourseViewPage.progress.test.tsx` mock `canQuickEditPublic: false`, so the inline path is never exercised.

### DEF-21 Quick-edit copy and labels (Low, copy)

- `InlinePageEditor.tsx:125-127` shows "Super Admin Privileged" to all quick-edit users (see DEF-08).
- `PublicQuickEditBar.tsx:112` uses `replace('_', ' ')`, which replaces only the first underscore.

## 6. Automated demonstrations (written, currently failing)

All files are new. No product code was changed. The tests assert the behaviour a product owner would expect, so each failure is the defect.

| File | Tests | Result today | Defects |
|---|---|---|---|
| `gg-cms/frontend/react-ui/src/components/editor/InlinePageEditor.defects.test.tsx` | 5 | 5 fail | DEF-02 (x2), DEF-03, DEF-09 (toolbar), DEF-15 (cancel) |
| `gg-cms/frontend/react-ui/src/lib/sanitize.inlineEditing.defects.test.ts` | 3 | 3 fail | DEF-10 |
| `gg-cms/frontend/react-ui/src/api/services/publicCmsService.inlineEditing.defects.test.ts` | 1 | 1 fail | DEF-13 |
| `gg-cms/backend/go-cms/internal/interfaces/http/handler/inline_editing_defects_test.go` | 3 | 3 fail | DEF-01 (article, course), DEF-07 (contract) |
| `gg-cms/backend/go-cms/internal/application/cms/inline_editing_defects_test.go` | 1 with 2 subtests (REVIEW, APPROVED) | fail | DEF-12 |

Test-file comments use the same DEF numbers as the register above.

Observed failure messages (abridged):

- `DEF-02`: `expected '' to be '<p>Live body</p>'`, and the save payload's body does not match the server body.
- `DEF-03`: `expected 'Article A' to be 'Article B'`.
- `DEF-06`: `SyntaxError: Unexpected non-whitespace character after JSON at position 51`.
- `DEF-09`: `expected "bound " to be called at least once` (cancel did not ask for confirmation).
- `DEF-10`: `expected 'Minor heading' to contain '<h5>Minor heading</h5>'`.
- `DEF-13`: `expected 'Short summary shown on cards' to be ''`.
- `DEF-01`: `public article response leaks unpublished draft body: "<p>UNAPPROVED DRAFT BODY</p>"`.
- `DEF-12`: `body changed while status stayed REVIEW`, and the same for APPROVED.
- `DEF-07`: `dto.CMSResponse has no updatedBy json field`.

Run commands:

```
cd gg-cms/frontend/react-ui
npx vitest run src/components/editor/InlinePageEditor.defects.test.tsx src/lib/sanitize.inlineEditing.defects.test.ts src/api/services/publicCmsService.inlineEditing.defects.test.ts

cd gg-cms/backend/go-cms
go test ./internal/application/cms/ -run TestDEF12 -count=1
go test ./internal/interfaces/http/handler/ -run TestDEF0 -count=1
```

Before merging fixes, either keep these red until fixed, or mark each with `it.fails` (vitest) or a `t.Skip` with the defect ID, so CI stays meaningful. Remove the markers when the fix lands.

## 7. Items checked and found acceptable

- Non-admin update is owner-only on the backend, and tested (`TestCMSUpdate_NonOwner_Forbidden`).
- Public endpoints gate unpublished content on `previewAllowed` (owner, reviewer or admin with `?preview=true`), so anonymous `?preview=true` does not expose drafts (`public_handler.go:93`, `:180`, `:292`, `previewAllowed` at `:306-318`).
- PUBLISHED content is snapshotted on the first edit and the snapshot is cleared on publish (`service.go:377-408`, `:689-696`).
- All stored body HTML is sanitised before `dangerouslySetInnerHTML` (`PublicArticleView.tsx:749`, `CourseViewPage.tsx:1016`, `:1103`). Editor input cannot inject script into the public page, although the stored raw HTML is not sanitised on write (DEF-10).
- The inline editor refuses to render for `tiptap` bodies (`InlinePageEditor.tsx:62-73`), so TipTap JSON is not corrupted by the textarea.
- No autosave exists, so there are no autosave race conditions to report. Concurrency is covered by DEF-14.

## 8. UX recommendations

### Learner-facing (course and article readers who are not editors)

- Show no edit affordances at all. The `canQuickEditPublic` gate must be the only route to them, and it must match the backend (DEF-08).
- Never show draft or pending text to a learner, even when the learner is also an editor on a different item. The public projection must be the only source for learners (DEF-01).
- If learners need to report problems, offer a "suggest a change" or "report an issue" action that creates a review comment or a task. It must not write to the body.

### Admin and editor inline editing

- Show Inline Edit only to a user who will be allowed to save (owner or admin, or whatever rule DEF-08 settles on). Show the reason when the button is disabled.
- Open the editor only when the live version and the pending revision are both loaded (DEF-02). Show a loading state until then.
- Show one status line at the top of the editor: "Editing revision v3 (DRAFT). Live version is v2 (published)." When the item has never been published, say "Draft, not yet live."
- Make the two actions unambiguous. "Save draft" keeps the change private to the revision. "Submit for review" sends it on. If the content is in REVIEW or APPROVED, show "Saving will send this back for review" before saving (DEF-12).
- Keep a dirty indicator, confirm on Cancel and on route change, and autosave a server-side draft with a conflict check (DEF-14, DEF-15).
- Use a live WYSIWYG preview produced by the same sanitiser the public page uses (DEF-10).
- Offer "Open full editor" for `blocks` and `tiptap` items instead of the textarea (DEF-09).
- After any save, refresh the public projection and the draft state immediately, and show the diff against live (DEF-04).
- The "Switch to live" and "Switch to my revision" control must change the content shown (DEF-05).

## 9. Proposed fixes, by priority

1. **Stop the data loss (DEF-02, DEF-03, DEF-13).** Gate editor mount on loaded data. Key the editor by item and version. Use the authenticated raw body for editing. These are small, frontend-only changes. Ship with the failing tests converted to passing.
2. **Stop the public leak (DEF-01).** Change the projection to always replace draft fields when `HasPendingDraft` is true. Add the two regression tests.
3. **Make the permission model consistent (DEF-08, DEF-06, DEF-07).** Decide the rule, enforce it on the backend, mirror it in the UI, and expose the revision author.
4. **Fix the workflow integrity gap (DEF-12, DEF-14).** Block or reset approval on edits under review. Add optimistic concurrency to the update path.
5. **Fix the dead controls and stale state (DEF-04, DEF-05, DEF-16).** Invalidate public keys, unify view state, and make save-and-submit clear about partial failure.
6. **Fix the editor (DEF-09, DEF-10, DEF-11, DEF-15).** Format guard for `blocks`, sanitiser allowlist plus server-side sanitising, selection-aware toolbar, dirty guard.
7. **Copy and cleanup (DEF-17 to DEF-21).**

## 10. Test plan

Unit (frontend, vitest):

- InlinePageEditor: mount-before-data, prop change while open, item change, dirty cancel, toolbar on each format, save payload, error keeps the editor open. The defect file already covers most of these; add the error-path and format-guard cases after the fixes.
- PublicQuickEditBar: banner visibility matrix (anonymous, quick-edit non-author, quick-edit author, master admin) once DEF-07 provides an author. The switch control must call the page's view setter.
- sanitize: golden tests covering every tag and attribute that `contentBlocksToHtml` emits, plus HTML typed by hand in the editor. Round-trip `html`, `markdown` and `blocks`.
- publicCmsService.getBody: returns only body, never description (already written).

Integration (frontend, vitest with QueryClient):

- Save mutation invalidates `public-cms` keys (DEF-04).
- Route change between two articles closes the editor and clears its state (DEF-03).

Backend unit (Go):

- `articleToPublicCMS` and `courseToPublicCMS`: draft never leaks with NULL snapshot (written).
- `service.Update` on REVIEW and APPROVED: status changes, or 409 is returned (written).
- Optimistic lock: stale version returns conflict; concurrent publish is not reverted (to write).
- Permission matrix on `Update` and `Submit` for owner, non-owner quick-edit group member, reviewer, admin, anonymous (extend `cms_handler_security_test.go`).
- Body validation per `contentFormat` (to write, after DEF-09 decision).

End to end (Playwright, `gg-cms/frontend/react-ui/e2e`):

- Owner edits a published article inline, saves, sees the revision banner on the public page without refreshing (DEF-04).
- Quick-edit non-author cannot see another author's draft text (DEF-06).
- Anonymous visitor JSON for a pending-draft article with empty snapshot contains no draft text (DEF-01).
- Navigate from article A to B while the editor is open: editor closes, B's content is untouched (DEF-03).
- Block-format article: open inline editor, click Bold, save: page still renders the blocks (DEF-09).

## 11. Not verified

- No running app or browser session was used. DEF-03 and DEF-04 are established from code and router and React Query semantics, not from a browser trace. They should be confirmed with the Playwright cases above.
- The product policy on draft visibility to group members (DEF-06) and whether `publicQuickEdit` should be enforced server-side (DEF-08) are product decisions. The review assumes the policy text in the banner (`PublicQuickEditBar.tsx:231`) is the intended one.
