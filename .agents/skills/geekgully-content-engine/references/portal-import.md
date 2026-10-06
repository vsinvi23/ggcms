# GeekGully portal import format (gg-cms Bulk Import)

Derived from the importer source in the gocms repo (`gg-cms/backend/go-cms/internal/application/importer/`:
`parser.go`, `images.go`, `svg.go`) and `gg-cms/docs/BULK_IMPORT_GUIDE.md`, as of commit `23cd4c80`.
**If the importer changes, re-read those files** — this reference can go stale. Every GENERATE
output must be importable as-is and land as a `DRAFT` for human review (nothing auto-publishes).

## What the importer accepts

`.md`/`.markdown`, `.json`, `.csv`, `.html`/`.htm`, and `.zip` (documents + images). Recommended
for GeekGully content: **Markdown with frontmatter**, or a **zip** when the page has images.

## Markdown frontmatter (parser is line-based — keep it simple)

```markdown
---
title: "Prompt Injection Explained for Developers"
type: ARTICLE
category: ai-security
description: "Learn direct and indirect prompt injection, with a safe example and the controls that reduce risk."
articleType: guide
tags: [prompt-injection, llm-security, owasp, ai-security]
status: DRAFT
---
```

| Key | Notes |
|---|---|
| `title` | Falls back to first `# H1`, then filename. Keep ≤60 chars (doubles as SEO title). |
| `type` | `ARTICLE` (default), `COURSE`, `VIDEO`, `LEARNING_PATH`. Anything else silently becomes ARTICLE. |
| `category` / `categorySlug` / `category_slug` | Must be an **existing portal category slug** (list below). Never invent one. Existing repo content uses `categorySlug:`. |
| `description` | Single line. Use the 140–160 char meta description here. |
| `articleType` | Existing `content/` articles use uppercase: `GUIDE` (298), `DEEP_DIVE` (216), `INTERVIEW_PREP` (10), `HOW_TO`, `TUTORIAL`, `REFERENCE`. The BULK_IMPORT_GUIDE lists lowercase `standard/tutorial/deep_dive/guide`. **Match the existing content (uppercase)** and confirm in the importer preview. Map: guide/roadmap/cert guide → `GUIDE`; lab → `HOW_TO`; interview page → `INTERVIEW_PREP`; cheat sheet → `REFERENCE`; deep dive → `DEEP_DIVE`. |

### Existing category slugs (from migration 001 and existing content)

Defined across `gg-cms/backend/go-cms/migrations/postgres/*.sql` (re-grep `INSERT INTO categories`
to refresh; confirm each resolves in the importer preview, since migrations are not the live DB).

- Top level: `software-engineering`, `cloud-infrastructure`, `cybersecurity`, `data`, `ai-machine-learning`.
- Cybersecurity sub: `security-fundamentals`, `appsec-threats`, `identity-access`, `pki-cryptography`,
  `ai-llm-security`, `cloud-security-compliance`, `devsecops-supply-chain`.
- Cloud sub: `cloud-platforms`, `containers-orchestration`, `infrastructure-as-code`,
  `observability-monitoring`, `platform-engineering`, `serverless-edge`, `site-reliability-engineering`.
- AI sub: `generative-ai`, `machine-learning-foundations`, `ai-software-engineering`, `ai-evaluation`,
  `ai-governance`, `ai-infrastructure`, `autonomous-ai-agents`, `llm-engineering-rag`, `edge-physical-ai`.
- Software sub: `programming-languages`, `backend-apis`, `software-design`, `api-engineering-protocols`,
  `frontend-architecture`, `system-design-architecture`.
- Data sub: `databases`, `data-engineering`, `realtime-event-streaming`, `vector-databases-search`.

There is **no** SOC/blue-team, careers, labs, certifications, or salary category. Mapping used so far:
SOC/detection/log/scanning basics and interview pages → `security-fundamentals`; container/CI
security → `devsecops-supply-chain`; AI security labs → `ai-llm-security`; careers and certification
pages → top-level `cybersecurity`. Record the intended GeekGully segment/URL in the sidecar brief; a
new category needs a human/migration decision. Interview pages follow their topic's category (not a
separate interview category).

Existing content layout: `content/<domain>/<subcategory>/<slug>.md` (+ `content/images/`). Check
for the same slug/topic there before proposing a page (duplication gate).
| `courseType` | e.g. `STANDARD` (COURSE only). |
| `tags` | **Inline array only: `tags: [a, b, c]`.** Verified by running `importer.Parse`: a YAML list (`tags:` followed by `- "a"` lines) yields **0 tags**. Many existing `content/` files use the list style and therefore import with no tags; the sibling `content-authoring` skill says list style works, which is wrong for the current parser. Flag it, don't copy it. |
| `status` / `state` | Optional; imports land as `DRAFT` regardless of review state. Don't set PUBLISHED. |
| `interactiveMetadata` | Optional single-line value; leave unset unless the portal's quiz/interactive format is known. |

**Parser gotchas (these break imports silently):**
- One `key: value` per line. No multi-line values, nested YAML, or YAML lists.
- The frontmatter ends at the **first `---` anywhere after the opening one**, even inside a value.
  Never put `---` (or an em-dash typed as three hyphens) inside a title or description.
- Unknown keys are **ignored silently**: `url`, `meta_title`, `author`, `schema_type`, `reviewer`,
  `cta`, etc. are NOT imported. Don't expect them to appear on the page.
- The article slug/URL is **not** set from markdown frontmatter (only JSON `pathId` for learning
  paths). Recommended URL is advisory: the editor must set/verify it in the portal. Flag as
  "Requires human action: set URL to /…/".
- Quote values containing `:` is fine (split on first colon), but surrounding quotes are stripped.

So: portal-importable fields ≙ `title`, `type`, `category`, `description`, `articleType`, `tags`.
Everything else in the content brief (meta title, canonical URL, author, reviewer, schema, CTA,
internal-link plan, sources, verification list) goes in the **sidecar brief** (below), not
frontmatter.

## Body rules

- Start the body with the Quick answer, not a duplicate H1 if the portal already renders the title
  (the importer keeps the body as written; if you include `# Title`, it appears in the body —
  prefer one H1 only; check how the portal renders title vs body).
- Standard Markdown; fenced code blocks with a language tag. Tables are fine.
- Internal links: root-relative (`/learn/ai-security/secure-rag/`). External: absolute `https://`.
- No raw HTML except the inline SVG pattern below.

## COURSE structure (`type: COURSE`)

```markdown
Course overview text before the first section.

## Section: Getting Started

### Lesson: Introduction
Lesson body…

### Lesson: Setup
Lesson body…
```

- Exactly `## Section: <title>` and `### Lesson: <title>`. Text before the first `## Section:` is
  the overview. Lessons default to type `text`.
- **The splitter does not understand code fences.** A line inside a fenced block that starts with
  `## Section:` or `### Lesson:` will split the lesson. Never write those prefixes in examples.
- Don't use `## Section:` / `### Lesson:` for ordinary headings inside lesson bodies; use `####`
  or deeper for sub-headings in lessons.
- Re-importing with overwrite replaces a course's sections and lessons in one transaction.
- JSON alternative supports `duration` and `order` per lesson (see BULK_IMPORT_GUIDE §3).

## Images

### Raster images (PNG, JPEG, GIF, WebP) — zip import

Ship a `.zip` with the markdown plus images; reference with **relative paths**:

```text
prompt-injection.zip
├── prompt-injection.md
└── images/
    ├── prompt-injection-flow.png
    └── agent-tool-boundary.webp
```

```markdown
![Diagram showing untrusted web content flowing into an LLM agent that holds tool access](images/prompt-injection-flow.png)
```

Rules:
- Paths relative to the document's own folder (leading `/` = zip root). No `../` escaping the zip.
- **No spaces in filenames or paths** (the reference regex stops at whitespace). Use
  lowercase-hyphenated names. An optional `"title"` after the path is allowed.
- Formats are **sniffed from bytes**, not extension. Accepted: PNG, JPEG, GIF, WebP. Anything else
  (BMP, TIFF, AVIF, `.svg` files) is ignored.
- Lookup is case-insensitive, but keep case consistent anyway.
- `http(s)://`, `data:`, `//`, and `#` references are **not imported** (left as external).
- Missing or escaping paths produce per-item **preview warnings**; fix before confirming.
- Images are stored via the configured storage provider, deduped by hash, and refs rewritten.
- **Super-admin only.** Plain admins get documents only, with a warning that images were skipped.
  Confirm the importing user is in the SuperAdmin group.
- Limits for non-super-admin: 500 entries, 10 MB/file, 50 MB total, 100:1 compression ratio.
  Super admin lifts these, but max 200 images/zip applies under the standard limits — keep
  archives small and images optimized (target <300 KB each, ≤1600 px wide).
- Zip security always applies: no `..`/absolute paths, no nested zips, dotfiles/`__MACOSX` skipped.
- Every image needs **meaningful alt text** (accessibility checklist item 26) and should be
  original (own diagram/screenshot/lab output) — never copied from third-party sites.

### Inline SVG diagrams (preferred for diagrams)

Write the `<svg>…</svg>` block directly in the markdown. The importer converts it to a sanitized
`data:image/svg+xml;base64` image (`![SVG diagram](data:…)`). `.svg` **files** are never stored.

Authoring rules (anything violating these is silently dropped or the block is left unchanged with
a preview warning):
- `<svg` must **start the line** (after whitespace), and `</svg>` must end it; blank lines inside
  are fine. Not inside a fenced code block (fenced SVG stays as code — use that to *show* SVG source).
- Must be **well-formed XML** (strict): closed tags, quoted attributes, `/>` for empty elements.
  Max 1 MB, 5000 lines.
- Allowed elements: `svg g path rect circle ellipse line polyline polygon text tspan title desc
  defs linearGradient radialGradient stop clipPath mask pattern marker symbol use`.
- **Dropped:** `<style>`, `<script>`, `<foreignObject>`, `<image>`, `<a>`, `<filter>`, `<animate*>`,
  and any other element (including their children). Style via presentation attributes
  (`fill`, `stroke`, `font-size`, …) instead of CSS classes.
- Text content is kept only inside `text`, `tspan`, `title`, `desc`.
- Attributes: allowlisted presentation/geometry attributes only. Values containing `javascript:`,
  `data:`, `@import`, `expression(`, `<`, `>` are dropped. `href` only as `#id` (for `<use>`).
  `url(...)` only for same-document refs, e.g. `fill="url(#grad)"`. No event handlers.
- Always include `viewBox` (responsive) and add `role="img"`, `aria-label`, plus `<title>` and
  `<desc>` for accessibility. The resulting alt text is the fixed string "SVG diagram", so add a
  one-sentence **text caption or description in the paragraph directly below** the diagram.
- Use colors with sufficient contrast on both light and dark backgrounds (no reliance on
  background; set an explicit `rect` background or choose mid-tone palettes). Don't convey meaning
  by color alone.
- Use `font-family="system-ui, sans-serif"`; keep text short — no reliance on web fonts.

Template:

```markdown
<svg viewBox="0 0 640 220" role="img" aria-label="Untrusted content reaches an LLM agent and its tools">
<title>Indirect prompt injection flow</title>
<desc>A web page with hidden instructions is retrieved by an agent, which then calls a tool it should not.</desc>
<rect x="0" y="0" width="640" height="220" fill="#ffffff"/>
<rect x="20" y="80" width="150" height="60" rx="8" fill="#e8f0fe" stroke="#1a56db" stroke-width="2"/>
<text x="95" y="115" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="#111827">Untrusted page</text>
<line x1="170" y1="110" x2="250" y2="110" stroke="#374151" stroke-width="2"/>
<rect x="250" y="80" width="150" height="60" rx="8" fill="#fef3c7" stroke="#b45309" stroke-width="2"/>
<text x="325" y="115" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="#111827">LLM agent</text>
</svg>

*Figure 1: Hidden instructions in retrieved content can steer an agent that holds tool access.*
```

Validate by converting mentally against the allowlist, or run the importer preview: a block that
fails stays as raw `<svg>` text and shows a warning.

## Deliverables for GENERATE (portal-ready package)

For each page produce:
1. `<slug>.md` — frontmatter (`title,type,category,description,articleType,tags`) + body, inline SVG
   for diagrams.
2. If there are raster images: `<slug>.zip` layout (`<slug>.md` + `images/*.png|jpg|gif|webp`) and a
   list of image files still to be created, with alt text. (the agent writes text files; for binary images
   provide a spec/placeholder and mark "image to be created".) Never reference an image that
   isn't in the package.
3. `<slug>.brief.md` — **sidecar** with everything the portal does not import: meta title, canonical
   URL, author, technical reviewer, schema JSON-LD, CTA, internal-link plan, external sources,
   media plan, safety review, verification list, review dates (`last_reviewed`, `next_review_date`),
   `ai_assistance` and disclosure flags.
4. A short **import checklist** for the human (see below).

Suggested location: `content/` in the gocms repo if the user asks to write files; otherwise return
in chat. Don't write into the repo unprompted. Match existing content conventions in `content/`
and `.agents/skills/content-authoring/SKILL.md` if present.

### Import-readiness checklist (include in every package; QA checks it too)

- [ ] Frontmatter keys limited to supported ones; no `---` inside values; `tags` inline array
- [ ] `type` is a valid value; `category` slug verified to exist in the portal
- [ ] `description` is one line, 140–160 chars
- [ ] COURSE: only `## Section:` / `### Lesson:` headings; none inside code fences
- [ ] Image paths relative, no spaces, files present in the zip, formats PNG/JPEG/GIF/WebP
- [ ] Diagrams are inline SVG meeting the allowlist; each has `viewBox`, `role`, `aria-label`,
      `<title>`, `<desc>` and a caption below
- [ ] Every image has descriptive alt text (SVG: caption)
- [ ] Importer **preview** shows no warnings (missing images, unparsed SVG, skipped images)
- [ ] Importing user is super admin if the zip contains raster images
- [ ] Imported as DRAFT; URL/slug, author, reviewer, schema, CTA set manually in the portal from
      the sidecar brief; routed to the human reviewer workflow
- [ ] Re-import of an existing slug uses the intended overwrite/skip option
