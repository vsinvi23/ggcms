# Code Syntax Highlighting Review

Status: review only. No product code changed. Nothing committed.
Scope: `gocms/gg-cms/frontend/react-ui` and `gocms/gg-cms/backend/go-cms`, plus the markdown corpus in `gocms/content/`.
Symptom reported by product owner: "code syntax is not working as expected".

Reproduction artefacts (new files, uncommitted):
- `gg-cms/frontend/react-ui/src/lib/codeSyntaxHighlighting.review.test.ts` (vitest, 41 tests: 18 characterisation pass, 23 known-defect reproductions via `it.fails`)
- `gg-cms/backend/go-cms/internal/application/importer/codesyntax_review_test.go` (Go, 3 tests: 2 `KnownDefect` asserts current defective output, 1 guard)

Run:
- `cd gg-cms/frontend/react-ui && npx vitest run src/lib/codeSyntaxHighlighting.review.test.ts`
- `cd gg-cms/backend/go-cms && go test ./internal/application/importer/ -run CodeSyntaxReview -v`

---

## 1. Summary

The highlighter works on the public article page. The most visible failures are elsewhere:

1. **Course lesson code is never highlighted, and course overview code is only highlighted in one state.** `CourseViewPage.tsx:317-334` ties the highlight effect to a state variable that stays empty for legacy courses and never changes on lesson navigation. Lesson content (`CourseViewPage.tsx:1095-1103`) has no highlight call at all. This is the most likely cause of "not working as expected".
2. **Some fence languages are rejected by the markdown parser, and the rejection swallows the following prose.** `htmlParser.ts:126` only accepts `\w*` tags, so `c++`, `c#`, `objective-c`, and `vb.net` fail. The closing fence of the rejected block then opens a new code block that runs to the end of the document (reproduced, CODE-01b). Tilde and 4-backtick fences are also unsupported in the frontend, although the backend accepts `~~~`.
3. **The sanitiser strips language classes that contain `+`, `#` or `.`.** `sanitize.ts:23,33` removes `language-c++`. Highlighting then falls back to auto-detection, so the colours are wrong rather than missing (reproduced, CODE-04/CODE-12).
4. **Coverage gaps in both the reader and the editor.** 49 of 1,919 tagged fences in `content/` use grammars missing from the full highlight.js bundle (mostly `hcl`), so they render as plain text. The editor dropdown (`languages.ts`) cannot select 830 of 1,919 fences (43%), including `text` (706 fences).
5. **Light-mode token contrast fails WCAG AA.** Only `atom-one-dark` is loaded (`main.tsx:5`), so light mode uses dark-theme token colours. Keyword 2.81:1, string 1.93:1, built-in 1.65:1 on the light code background. Dark-mode comments are 2.95:1.
6. **Course import splits inside code samples.** The course splitter is not fence-aware (`backend/.../importer/parser.go:206,211`). A `### Lesson:` line inside a code sample starts a new lesson (Go reproduction, CODE-13).
7. **Prose rules rewrite code-like text, and link URLs are double-escaped.** `htmlParser.ts:456-460` turns `my_var_name` into `my<em>var</em>name`, and `htmlParser.ts:421-431,450` turns `&` in URLs into `&amp;amp;` (reproduced, CODE-07/CODE-08).

Corrected hypothesis: the entity double-decoding I suspected in `htmlToContentBlocks` does not occur. `unescapeHtml` (`htmlParser.ts:258-263`) is a no-op (see CODE-23). The corresponding test is a characterisation, not a defect.

Corpus parity check: `markdownToContentBlocks` run over all 542 files in `gocms/content/` produces exactly one code block per opening fence, with zero mismatches. None of the rejected languages (CODE-01/02/03) appear in the corpus, so the current content is parsed correctly. The corpus problems are rendering problems (items 1, 4, 5).

---

## 2. Pipeline map

| Stage | Where | Notes |
|---|---|---|
| Authoring (blocks mode) | `components/articles/RichContentEditor.tsx:238-272` | Language `Select` from `SUPPORTED_LANGUAGES`; code is a plain `Textarea` (no Tab handling). Saved as `ContentBlock{type:'code', codeData:{language, code, filename}}`. |
| Authoring (TipTap mode) | `components/articles/RichTextEditor.tsx:184-200`, `components/articles/tiptap/extensions.ts:12,27` | `CodeBlockLowlight` with `common` grammars. Language select defaults to `plaintext` for display (`RichTextEditor.tsx:189`) but the stored attribute can be null. |
| Markdown import (backend) | `backend/go-cms/internal/application/importer/parser.go:89-132` | Keeps raw markdown, `BodyFormat:"markdown"`. Fence-aware only for SVG/image rewriting (`svg.go:196`, `images.go:136,174`). Course splitter is not fence-aware (`parser.go:206,211`). |
| Markdown import (frontend conversion) | `pages/BulkImport.tsx:756-761,787`, `lib/htmlParser.ts:97-145` | Confirm step converts markdown to blocks JSON via `markdownToContentBlocks`. Only path that creates colour-able blocks from `.md`. |
| HTML import | `lib/htmlParser.ts:155-172` (`htmlToContentBlocks`), `:304-318` | Language from `class="language-(\w+)"`. |
| Storage | `backend/go-cms/internal/application/cms/service.go:230,260` | Body stored as text. Import commit does not set `contentFormat`, so it defaults to `'blocks'`. No server-side HTML generation exists (no `<pre>`/`<code>` generation in Go). |
| Blocks to HTML | `lib/htmlParser.ts:471-489` (`contentBlocksToHtml`) | Emits `<div class="code-block"><div class="code-block-header">…</div><pre><code class="language-${lang}">` with `escapeHtml` on code but not on `lang` (`:488`). |
| TipTap to HTML | `lib/tiptapRenderer.ts:16-24`, `@tiptap/html` `generateHTML` | Emits `<pre><code class="language-x">` with no header, label, or filename. |
| Sanitise | `lib/sanitize.ts:14-44` | `class` allowed. `SAFE_CLASS_PATTERN` (`:23`) drops any class with characters outside `[a-zA-Z0-9 -]`. `data-*` disallowed (`ALLOW_DATA_ATTR:false`). |
| Highlight runtime | `pages/PublicArticleView.tsx:234-243`, `pages/CourseViewPage.tsx:317-334`, `pages/PublicCourseView.tsx` (no body rendering) | `hljs.highlightElement` on each `pre code`, from `highlight.js` full bundle (`PublicArticleView.tsx:3`, `CourseViewPage.tsx:3`). |
| Theme | `main.tsx:5` (`atom-one-dark.css`), `index.css:138-140,148-149,152-185,250-345` | Single global light/dark token set. Code background set in index.css per container. |
| Dead or unrouted | `App.tsx:51` (ArticleViewPage, no route), `App.tsx:54` (PublicCourseView, not routed), `components/articles/EducativeArticleReader.tsx:326` (import preview, no highlight) | See CODE-22. |

Highlight run points:
- `PublicArticleView.tsx:234-243`: effect keyed on `[displayBodyHtml, article?.contentFormat]`. Re-runs when the body string changes. Works for article pages.
- `CourseViewPage.tsx:326-334`: keyed on `[tiptapCourseBodyHtml, displayCourse?.contentFormat]`. Only re-runs for the TipTap overview. Legacy overview and lessons are not covered.

---

## 3. Defect table

Severity: High = visible wrong or missing output on content that exists or is common. Medium = affects a specific content class. Low = polish, accessibility, or dead code.

| ID | Sev | Symptom | Root cause | file:line | Repro | Suggested fix |
|---|---|---|---|---|---|---|
| CODE-15 | High | Course lesson code blocks are never coloured. Legacy course overview is never coloured. Overview code is uncoloured after going lesson to overview. | Highlight effect keyed on `tiptapCourseBodyHtml`, which is empty for legacy and does not change on navigation. Lesson container (`:1095-1103`) has no `hljs` call and no ref. Ref `courseBodyRef` (`:1015`) only exists in the overview branch. | `pages/CourseViewPage.tsx:317`, `:326-334`, `:1015`, `:1095-1103` | Code reading (no unit test; React page). Plan E2E-1, E2E-2, E2E-3. | Give every rendered body container a ref, and run highlight on the rendered HTML for legacy and TipTap alike. Key the effect on the rendered string and on lesson id. Share one `highlightCodeIn(el)` helper with the article page. |
| CODE-01b | High | After a rejected fence such as ```` ```c++ ````, all following prose becomes a code block until the next fence. | Rejected opener is paragraph text, but its closing ```` ``` ```` matches the bare-fence opener regex and opens a new code block that runs to EOF. | `lib/htmlParser.ts:126`, `:133` | `CODE-01b` (vitest, passes as expected-fail). | Implement CommonMark fence rule: opener is 3+ backticks or tildes, optional info string, closer uses same char and at least same length. Treat unrecognised info strings as language text, not as "not a fence". |
| CODE-01 | High | ```` ```c++ ````, ```` ```c# ````, ```` ```objective-c ````, ```` ```vb.net ```` render as paragraphs, not code. | Fence regex only allows `\w*` info string. `+`, `#`, `.`, `-` cause the line not to match. | `lib/htmlParser.ts:126`, `:130` | `CODE-01` (c++, c#, objective-c). | Accept info string `[^\s`]*`. Normalise aliases (`c++`→`cpp`, `c#`→`csharp`, `vb.net`→`vbnet`). |
| CODE-04 | Medium | Language class dropped from `<code>` for `c++`, `c#`, `vb.net`. Highlight falls back to auto-detect, so the wrong grammar or wrong colours appear. | `SAFE_CLASS_PATTERN` rejects `+`, `#`, `.`. `uponSanitizeAttribute` hook sets `keepAttr=false`. Applies to every reader that sanitises code HTML. | `lib/sanitize.ts:23`, `:30-35`, `:44`; used at `pages/PublicArticleView.tsx:749`, `pages/CourseViewPage.tsx:1016,1103`, `components/articles/EducativeArticleReader.tsx:326` | `CODE-04` (three cases). Probe showed class removed from `<code class="language-c++">`. | Allow `+`, `#`, `.` only in `language-*` class values, or map language names to safe slugs before emitting the class. |
| CODE-12 | Medium | Same symptom for TipTap articles (new format). | Same sanitiser, applied after `generateHTML`. Probe: `<pre><code class="language-c++">` becomes `<pre><code>`. | `lib/sanitize.ts:23,33`; `lib/tiptapRenderer.ts:16-24`; `pages/PublicArticleView.tsx:749` | `CODE-12`. | As CODE-04. |
| CODE-06 | Medium | HTML-imported `c++` becomes `c`. `objective-c` becomes `objective`. Wrong grammar, or none. | `\w+` regex stops at `+` and `-`. | `lib/htmlParser.ts:308` | `CODE-06` (two cases). Probe: `"c"`, `"objective"`. | Use `/language-([^\s]+)/` and normalise. |
| CODE-07 | Medium | Prose identifiers like `my_var_name` render as `my<em>var</em>name`. `2 * 3 * 4` italicises the middle. | Inline emphasis regexes run on all text outside backtick spans. | `lib/htmlParser.ts:456` (bold `__`), `:460` (italic `_`), plus `*` rules near `:455-459` | `CODE-07` (two cases). Probe: `<em>var</em>`. | Only apply `_`/`*` emphasis at word boundaries (`(?<![\w])_(?=\S)`). Or drop `_`-italic. |
| CODE-08 | Medium | Links whose URL has `&` (query strings) are broken: `href` contains `&amp;amp;`. | URL is escaped in `renderInline` (`escapeHtml` at `:438`), then again in `safeHref` (`:424-425`). | `lib/htmlParser.ts:421-431`, `:437-438`, `:450` | `CODE-08`. Probe: `href="https://e.com/?a=1&amp;b=2"`. | Escape once. Validate the raw URL, then escape once when writing the attribute. |
| CODE-09 | Medium | 49 fences (hcl 31, rego 5, sqlx 3, assembly 2, haproxy 2, mermaid 2, circom 1, conf 1, ignore 1, redis 1) render uncoloured on reader pages. | Full highlight.js bundle has no grammar for these names. Unregistered `language-x` returns `no-highlight` (hljs `blockLanguage`), so the block is left plain with a console warning. | `pages/PublicArticleView.tsx:3`, `pages/CourseViewPage.tsx:3`, `lib/htmlParser.ts:488` | `CODE-09` (hcl, rego, sqlx, mermaid). | Add grammars that exist for `hcl` (for example `highlightjs-terraform`) or alias `hcl` to a close grammar. Mermaid should go to the diagram path, not the code path (CODE-24). |
| CODE-10 | Medium | 830 of 1,919 fences cannot be selected in the editor dropdown. Imported `text` (706) and `dockerfile` (13) show no language label. | `SUPPORTED_LANGUAGES` has `plaintext`, not `text`; `docker`, not `dockerfile`. No entries for `hcl`, `http`, `ini`, `nginx`, `rego`, and others. The `Select` gets a value with no matching item, so it shows blank. Badge label also blank (`RichContentEditor.tsx:177`). | `lib/languages.ts:1-27`; `components/articles/RichContentEditor.tsx:177,247`; `components/articles/RichTextEditor.tsx:189,196` | Generated matrix (section 4). | Add the corpus languages to `SUPPORTED_LANGUAGES`. Alias `text`→`plaintext` and `dockerfile`→`docker` on import. |
| CODE-11 | Medium (a11y) | Light mode: keyword 2.81, string 1.93, built-in 1.65, number 2.35, title 2.28 on `#f8fafc`. Dark mode: comment 2.95 on `#0f172a`. WCAG AA requires 4.5:1. | Only `atom-one-dark` loaded globally (no light theme), and it is a dark-background palette. | `main.tsx:5`; token colours from `node_modules/highlight.js/styles/atom-one-dark.css` | `CODE-11` (four cases). Contrast table in section 5. | Ship a light and dark token palette, scoped under `.article-content`/`.edu-lesson-content`, each meeting 4.5:1 on its background. Remove the global `atom-one-dark` import. |
| CODE-13 | Medium | An imported course containing `### Lesson:` or `## Section:` inside a code sample is split into extra lessons or sections. | Course splitter does not track fences. | `backend/go-cms/internal/application/importer/parser.go:172-233` (lines `:206`, `:211`) | Go: `TestCodeSyntaxReview_KnownDefect_CourseSplitIgnoresFences` (asserts 2 sections, the wrong result). | Track fence state in `parseMarkdownCourseStructure` (same logic as `svg.go:183-197`). |
| CODE-02 | Medium | ```` ~~~bash ```` fences render as paragraphs in the markdown import. Backend accepts `~~~` for SVG and image rewriting, so behaviour is inconsistent. | Frontend fence regex only handles backticks. | `lib/htmlParser.ts:126`, `:133` | `CODE-02`. | Accept `~~~` and match closer to opener character. |
| CODE-03 | Low | A 4-backtick outer fence wrapping a ```` ``` ```` example is broken. Content corpus has 0 instances. | No support for variable fence length. | `lib/htmlParser.ts:126`, `:133` | `CODE-03`. | As CODE-01b fix. |
| CODE-14 | Low | Imported article title becomes a shell comment, e.g. `install deps`, when a fenced `# comment` appears before the real H1. | Title fallback scans lines for `# ` without fence awareness. | `backend/go-cms/internal/application/importer/parser.go:112-119` (line `:116`) | Go: `TestCodeSyntaxReview_KnownDefect_TitleFromFencedComment`. | Skip lines inside fences, same as CODE-13. |
| CODE-16 | Low (unverified) | Highlight may not run when the body container mounts without a dependency change, for example after `article` goes undefined and back during a refetch. | Effect deps are `[displayBodyHtml, contentFormat]`, not the mount of `articleBodyRef`. Edge case, reasoned from code, not reproduced. | `pages/PublicArticleView.tsx:234-243`, container at `:747-749` | Plan E2E-5. | Also depend on `article?.id` and on the container node (callback ref). |
| CODE-17 | Low | TipTap-rendered code has no language label, filename, or copy button. Legacy blocks render a header; TipTap does not. Inconsistent between formats. | `generateHTML` output has no header. Only `contentBlocksToHtml` writes `code-block-header`. No copy control exists anywhere. | `lib/htmlParser.ts:487-488`; `lib/tiptapRenderer.ts:16-24` | Code reading. | Add a shared code-block node view or post-process step that adds the header and copy button to both formats. |
| CODE-18 | Low | Bare code blocks (no language) get guessed grammars. A TipTap language that is null displays "Plain Text" in the editor but is auto-detected in the reader. | `highlightElement` calls `highlightAuto` when no language class is present. `RichTextEditor.tsx:189` displays `plaintext` as fallback without writing it. | `lib/htmlParser.ts:130` (import path uses `plaintext`; TipTap path does not), `components/articles/RichTextEditor.tsx:189` | `CODE-18` characterisation (auto-detect happens). | Always write an explicit language (default `plaintext`) on code block creation. Skip highlight for `plaintext`. |
| CODE-19 | Low | Editor colours and reader colours differ. Editor uses `lowlight` `common` (no dockerfile, powershell, http, nginx, hcl, and others), so it auto-detects. Reader uses full bundle. | Two highlighters with different grammar sets. | `components/articles/tiptap/extensions.ts:12` vs `pages/PublicArticleView.tsx:3` | Code reading; registration check in vitest "characterisation: the editor (lowlight common) lacks dockerfile and powershell". | Use one grammar set for both, for example pass the full bundle grammars to `createLowlight`. |
| CODE-20 | Low | Blocks-mode editor: pressing Tab moves focus; indentation cannot be typed. Browser tab-size is the default (8). | `Textarea` with no key handler for Tab. No `tab-size` in CSS. | `components/articles/RichContentEditor.tsx:265-277` | Manual. | Handle Tab and Shift+Tab in the textarea, or move code blocks to the TipTap editor. Set `tab-size: 4` on `pre`. |
| CODE-21 | Low (defence in depth) | Code block language is not escaped in the class attribute. A value containing `"` breaks the markup before sanitisation. | `class="language-${lang}"` written without escaping. | `lib/htmlParser.ts:488` | Code reading. | `escapeHtml(lang)` in the class, and validate language against an allowlist. |
| CODE-22 | Low | Dead or misleading code: `ArticleViewPage.tsx` is lazy-imported but never routed, and carries its own code CSS with hard-coded `#cbd5e1` colours. `PublicCourseView.tsx` is imported and never routed, and does not render bodies. | Leftovers. | `App.tsx:51`, `App.tsx:54`; `pages/ArticleViewPage.tsx:195-205` | Code reading. | Delete both pages or wire them up. Remove duplicate CSS. |
| CODE-23 | Low | `unescapeHtml` does nothing. Its name suggests entity decoding. | `textarea.textContent = text; return textarea.value` returns the input unchanged. Test "literal entity text inside `<pre>` is preserved" passes. | `lib/htmlParser.ts:258-263` | Characterisation test. | Use `DOMParser` or remove the helper (DOM text nodes are already decoded). |
| CODE-24 | Low | Mermaid fences in markdown import become plain code blocks, not diagrams. Corpus has 2 such fences. | Markdown import does not produce `data-mermaid-source` nodes. | `lib/htmlParser.ts:130` | Code reading. | Map `mermaid` info string to the mermaid node in the import converter. |
| CODE-25 | Low | Console noise: "Duplicate extension names found: link, underline". | `StarterKit` already includes `Link` and `Underline`, and they are added again. | `components/articles/tiptap/extensions.ts:19,21` | Seen in vitest output. | Remove the duplicates or configure StarterKit with `link:false, underline:false`. |

Checked, no defect found:
- Indentation, tabs, blank lines, and CRLF inside fences are preserved (characterisation tests).
- Long lines: `pre` has `white-space:pre; overflow-x:auto` (`index.css:138`, `:262-264`). Not tested at 390px width. See E2E-7.
- Inline code protected from emphasis (`renderInline` placeholder, `htmlParser.ts:443-447`).
- Backend performs no HTML generation for article bodies, so no server-side class stripping exists.
- `hljs.highlightElement` on an unknown language does not throw (hljs returns `no-highlight`). The concern that it would abort the `forEach` loop is wrong.

---

## 4. Language support matrix

Counts are opening fences across `gocms/content/**/*.md` (542 files). 1,919 fences have a language tag, 200 are bare (plain). Two columns from the runtime: reader = `highlight.js` full bundle (used by `PublicArticleView`, `CourseViewPage`), editor = `lowlight` `common` (used by TipTap). Dropdown = `SUPPORTED_LANGUAGES` value.

| Fence language | Fences | Reader grammar | Editor grammar | Dropdown value |
|---|---|---|---|---|
| text | 706 | yes (plaintext alias, no colours by design) | yes | no (only `plaintext`) |
| python | 278 | yes | yes | yes |
| bash | 153 | yes | yes | yes |
| go | 139 | yes | yes | yes |
| yaml | 88 | yes | yes | yes |
| sql | 77 | yes | yes | yes |
| javascript | 73 | yes | yes | yes |
| java | 60 | yes | yes | yes |
| typescript | 57 | yes | yes | yes |
| cpp | 50 | yes | yes | yes |
| json | 44 | yes | yes | yes |
| hcl | 31 | NO (plain) | no (auto) | NO |
| http | 23 | yes | no (auto) | NO |
| rust | 19 | yes | yes | yes |
| c | 17 | yes | yes | yes |
| ini | 15 | yes | yes | NO |
| dockerfile | 13 | yes | no (auto) | no (`docker` is the value) |
| nginx | 12 | yes | no (auto) | NO |
| xml | 10 | yes | yes | yes |
| csharp | 9 | yes | yes | yes |
| graphql | 5 | yes | yes | yes |
| rego | 5 | NO (plain) | no (auto) | NO |
| lua | 4 | yes | yes | NO |
| markdown | 4 | yes | yes | yes |
| html | 3 | yes | yes | yes |
| protobuf | 3 | yes | no (auto) | NO |
| sqlx | 3 | NO (plain) | no (auto) | NO |
| assembly | 2 | NO (plain) | no (auto) | NO |
| haproxy | 2 | NO (plain) | no (auto) | NO |
| jinja | 2 | yes | no (auto) | NO |
| mermaid | 2 | NO (plain) | no (auto) | NO |
| powershell | 2 | yes | no (auto) | yes |
| circom | 1 | NO (plain) | no (auto) | NO |
| conf | 1 | NO (plain) | no (auto) | NO |
| elixir | 1 | yes | no (auto) | NO |
| ignore | 1 | NO (plain) | no (auto) | NO |
| jsx | 1 | yes | yes | NO |
| php | 1 | yes | yes | yes |
| properties | 1 | yes | no (auto) | NO |
| redis | 1 | NO (plain) | no (auto) | NO |
| (bare, no tag) | 200 | auto-detect (CODE-18) | auto-detect | n/a |

Totals:
- Reader plain (no grammar): 49 fences (2.6%).
- Editor auto-detect (no grammar): 106 fences.
- Not selectable in dropdown: 830 fences (43%).
- Dropdown values the corpus does not use: `ruby`, `swift`, `kotlin`, `css`, `scss`, `docker` (corpus uses `dockerfile`), `plaintext` (corpus uses `text`). Keep them; they are valid choices for authors.

Languages in `SUPPORTED_LANGUAGES` that the reader cannot colour: none (all 26 values are registered in the full bundle; the vitest "characterisation" test asserts this).

---

## 5. Theme and accessibility findings

Background colours from `index.css`: light code `#f8fafc` (`.educative-article-reader pre`, index.css:250-265); dark code `#0f172a` (`.dark .article-content pre`, index.css:321-325). Ratios computed with the WCAG 2.x formula.

| Token (atom-one-dark) | Colour | On light `#f8fafc` | On dark `#0f172a` | AA 4.5:1 |
|---|---|---|---|---|
| base text (if not overridden) | `#abb2bf` | 2.04 | 8.38 | light fails |
| comment | `#5c6370` | 5.78 | 2.95 | dark fails |
| keyword | `#c678dd` | 2.81 | 6.06 | light fails |
| string | `#98c379` | 1.93 | 8.86 | light fails |
| number | `#d19a66` | 2.35 | 7.25 | light fails |
| title/function | `#61aeee` | 2.28 | 7.48 | light fails |
| type/built_in | `#e6c07b` | 1.65 | 10.36 | light fails |
| name/tag | `#e06c75` | 3.05 | 5.59 | light fails |
| literal | `#56b6c2` | 2.26 | 7.54 | light fails |
| code text (set by index.css) | `#0f172a` | 17.06 | n/a | pass |

Other findings:
- The base text colour is overridden by index.css (`educative-article-reader pre code` sets `color`), so plain code text passes. Only token spans fail.
- No copy button, no line numbers, and no focus or keyboard affordance for code blocks. The horizontal scroll container (`pre`) is focusable in some browsers but has no `tabindex` and no label; axe `scrollable-region-focusable` may flag it.
- Language label (`code-lang`) text is `#0f172a` on `#f1f5f9` in light mode and passes, but it only exists on the legacy path (CODE-17).
- Hard-coded colours in `pages/ArticleViewPage.tsx:195-205` (dead code, CODE-22) bypass the theme tokens.

---

## 6. Test plan

### 6.1 Already written (run before and after each fix)

Frontend (`codeSyntaxHighlighting.review.test.ts`): 41 tests.
- Characterisation (must keep passing): fence parsing for plain words, indentation, blank lines, CRLF, bare fence, sanitiser keeping `language-go`, entity single-decoding, inline code protection, hljs positive control, multi-block resilience, registry checks, TipTap `go` path, TipTap bare block.
- Known defects (`it.fails`): CODE-01, 01b, 02, 03, 04, 06, 07, 08, 09, 10, 11, 12. When a defect is fixed, its `it.fails` will report failure. Change the marker to `it` at that point.

Backend (`codesyntax_review_test.go`): 3 tests.
- `KnownDefect` tests (CODE-13, CODE-14) assert the current wrong output. Flip to the correct expectation when fixed.
- Guard: plain H1 title still works.

### 6.2 Add with the fixes (unit)
- Corpus parity test: run `markdownToContentBlocks` over `gocms/content/**/*.md` and assert code block count equals fence opener count. Currently 0 mismatches. Keep as a regression guard for CODE-01b.
- Language alias table: `c++`→`cpp`, `c#`→`csharp`, `vb.net`→`vbnet`, `text`→`plaintext`, `dockerfile`→`docker`, `objective-c`→`objectivec`. Test each.
- Sanitiser: allowed `language-*` values including `+`, `#`, `.` (after normalisation).
- `htmlToContentBlocks`: `language-objective-c`, `language-c++`, `language-vb.net`.
- Link href round trip with `&`, `%`, `#`.

### 6.3 Playwright E2E (not yet written; these need a browser for React timing)
- E2E-1: open a course lesson containing ```` ```go ```` code. Expect `pre code span[class*="hljs-"]` count > 0 in the lesson view. Fails today (CODE-15).
- E2E-2: open a TipTap course overview with code, go to a lesson, come back to overview. Expect highlighted spans in overview. Fails today.
- E2E-3: legacy course (`contentFormat=blocks`) overview with code. Expect highlighted spans. Fails today.
- E2E-4: article with ```` ```hcl ```` code. Expect plain text (documents CODE-09 until a grammar is added).
- E2E-5: navigate article A (with code) to article B (with code) through the sidebar and back. Expect highlight on both. Confirms or closes CODE-16.
- E2E-6: axe-core `color-contrast` scan of a code-heavy article in light and dark mode. Expect zero violations on token spans. Fails today (CODE-11).
- E2E-7: at 390px viewport, with a 200-character line in a code block. Expect no page-level horizontal scroll; `pre` scrolls. Expect 16px side gutter.
- E2E-8: author a c++ block in TipTap, save, reload the public article. Expect `language-c++` on `<code>` and coloured tokens. Fails today (CODE-12).
- E2E-9: blocks-mode editor, type a tab character in a code block. Expect a tab in the saved text (fails today, CODE-20).

### 6.4 Manual checks
- Blocks editor: language select on an imported `text` block shows blank label (CODE-10).
- Import preview (`EducativeArticleReader`): code appears uncoloured (CODE-22).
- Copy button absent on every code block (CODE-17).

### 6.5 Commands
- `cd gg-cms/frontend/react-ui && npx vitest run src/lib/codeSyntaxHighlighting.review.test.ts`
- `cd gg-cms/backend/go-cms && go test ./internal/application/importer/ -run CodeSyntaxReview -v`
- Corpus fence count: `awk -f` over `gocms/content/**/*.md` (the `text`, `python`, `bash` counts above came from this method).

---

## 7. Limitations and not verified

- No browser run. Highlighting behaviour on the React pages (CODE-15, CODE-16) is from code reading. E2E-1 to E2E-3 are the confirming tests.
- The TipTap and reader paths were exercised only in jsdom, not in a real browser, so layout findings (CODE-20 tab size, E2E-7) are unverified.
- Fence count: a line-based awk pass gave 1,919 tagged and 200 bare. The vitest parity probe counted 2,126 opening fences in total with 0 mismatches. The two counts use different trimming rules and are not reconciled to the last fence; the matrix uses the awk breakdown.
- `hcl` grammar choice (CODE-09) needs a product decision: third-party grammar package, or alias to a close grammar.
- Light-mode palette values in the suggested fix (CODE-11) are not designed. The ratios above only show which current tokens fail.
- No changes to product code, no commits.
