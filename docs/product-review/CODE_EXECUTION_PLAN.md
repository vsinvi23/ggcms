# Runtime and Code Execution for GeekGully: Engineering and Product Plan

Status: PLAN ONLY. No implementation in this document.
Owner decisions are listed in section 11. Items marked **[verify]** are assumptions or third-party claims that must be checked before a commitment.
Date basis: research snapshot 2026-10-23. Repo: `gocms/gg-cms` (git root is `gocms`; product-review docs live at `gocms/docs/product-review/`).

---

## 0. Summary

GeekGully teaches programming, cloud, DevSecOps and security. Today every code sample is static text with syntax highlighting, and every assessment is multiple choice. Learners cannot try a snippet, and assessments cannot test whether someone can write code.

Recommended direction, in order of value per unit of risk:

1. **Client-side runnable snippets** (Python via Pyodide, JavaScript in a locked-down iframe, SQL via sql.js). Zero server execution, zero server cost at launch, and the lowest security exposure.
2. **Server-graded code questions** inside existing assessments. Hidden tests live on the server only. Execution goes to a sandboxed runner, and the runner is a managed or self-hosted engine that we isolate on our own, not a public API.
3. **Code-review challenges** for interview prep. Mostly content and a rubric, with no execution needed at first.
4. **Ephemeral guided labs** (cloud and DevSecOps). This is the most expensive and riskiest tier. It is a separate, later phase with its own security review.

The first phase is the cheapest high-value slice: client-side runnable snippets on a small set of articles, behind a feature flag, with a go/no-go spike for the server runner running in parallel.

---

## 1. Current State (from the repo)

### 1.1 Frontend rendering and sanitisation

- **Content rendering.** `frontend/react-ui/src/lib/htmlParser.ts` converts imported markdown and HTML into typed blocks. Fenced code becomes `{type:'code', codeData:{language, code, filename}}` (line ~125-141). The `<pre><code class="language-…">` path (line ~304-317) reads the language from the class. Code blocks are re-emitted as HTML at line ~484-488.
  - **Finding (hygiene, not exploitable on its own):** line 488 writes `class="language-${lang}"` without escaping `lang`. Only the label span uses `escapeHtml(lang)`. The output then goes through DOMPurify with `SAFE_CLASS_PATTERN`, so the practical risk is low, but it should be escaped in Phase 0 because runnable blocks will add more attributes derived from the same field.
- **Sanitiser.** `frontend/react-ui/src/lib/sanitize.ts` uses DOMPurify with an allowlist. `ALLOW_DATA_ATTR: false`, so any `data-*` attribute added for a runnable block is stripped unless it is added to `ALLOWED_ATTR`. `sanitizeMarkHtml` allows only `<mark>`. Runnable blocks must be designed around this (see section 7).
- **Highlighting.** `highlight.js` is applied after render with `hljs.highlightElement(block)` in `PublicArticleView.tsx` (~line 240) and `CourseViewPage.tsx` (~line 331). Any runnable widget has to hydrate at the same point.
- **Editor.** `frontend/react-ui/src/components/editor/InlinePageEditor.tsx` has a code button (~line 158-162) that wraps selected text in backticks or `<code>`. TipTap is used for rich text (`@tiptap/extension-code-block-lowlight`, `@tiptap/starter-kit`). A runnable attribute on the TipTap code-block node is a schema change and is deferred to Phase 2.
- **Assessments.** `AssessmentTaker.tsx` (271 lines) renders multiple-choice questions from `AssessmentDefinitionDto.questions[{id,text,options[],multiple}]`. It submits `answers: [{questionId, selected:number[]}]`. There is no code-question type.
- **Practice.** `PracticeHub.tsx` lists assessments as practice items, counting questions from `interactiveMetadata`. It has no execution.
- **Test coverage.** Existing tests include `AssessmentTaker.test.tsx`, `CourseViewPage.test.tsx`, `CourseViewPage.progress.test.tsx` and `PracticeHub.test.tsx`. The new work should add tests in the same style.

### 1.2 Backend assessment model

`backend/go-cms/internal/application/assessment/questions.go`:

- `question` has `Options []string` and `Correct []int`. `parseMetadata` **rejects any question with fewer than 2 options** (`len(q.Options) < 2` returns `ErrInvalidAssessment`). A code question with no options would fail validation today. Phase 2 must add a `type` discriminator before the option check.
- `answerKeyFields` is `correctIndex, correctIndexes, answer, correct, correctAnswer, correctAnswers, explanation, rationale`. `SanitizeMetadata` removes exactly these from the public course endpoint (called from `handler/public_handler.go:367`). **Any code-test field added to interactive metadata (`tests`, `hiddenTests`, `expectedOutput`, etc.) would leak unless added to this list.** The plan avoids this by storing tests in their own table (section 5), not in metadata. The list should still be extended defensively.
- `maxQuestions = 500`, `maxOptions = 20`, `defaultPassMark = 70`.

### 1.3 Attempts schema (migration 003)

`backend/go-cms/migrations/postgres/003_learning_loop.sql`:

- `assessment_attempts`: `user_id, assessment_id (FK courses.id), status ('in_progress'), answers JSONB, score, correct_count, total_questions, pass_mark, passed, started_at, submitted_at, duration_seconds`.
- Unique partial index: one open attempt per user and assessment.
- `answers` is JSONB, so it can hold a code payload later without a column change. Code submissions still get their own table so that source code and runner output are not mixed into the attempt row and can be retained or purged separately.

Next free migration number is **007** (001-006 exist; 006 is `006_ai.sql`).

### 1.4 Router and config

- `backend/go-cms/internal/interfaces/http/router.go` has the learning-loop routes at lines ~487-499 (`/api/assessments/:id`, `/attempts`, `/attempts/me`, `/attempts/:attemptId/submit`). The AI layer routes are mounted under `/api/ai`. Rate limiters are `middleware.PublicRateLimit()`, `CertVerifyRateLimit()` and `NewInMemoryRateLimiter`. The in-memory limiter is per process (AI_LAYER.md notes the same limitation). Runner quotas must be DB-backed.
- Feature flags are rows in `app_settings`, edited through an admin endpoint with a 5 s cache (AI_LAYER.md). Code execution should use the same pattern (`code.enabled`, `code.runner.enabled`, `code.labs.enabled`).
- Secrets come from environment variables, as with `ANTHROPIC_API_KEY`. The runner endpoint URL and any token must follow the same rule.
- `docker-compose.yml` already sets `CORS_ALLOWED_ORIGINS`. The runner must be on a private network and never reachable from the browser.

### 1.5 Content: what languages and lab-style exercises exist

Fenced-code languages across `content/` (542 markdown files, 378 contain at least one of python/go/sql/javascript/bash):

| Fence language | Blocks | Execution tier (proposed) |
|---|---|---|
| `text` | 706 | none (output, logs, diagrams) |
| `python` | 277 | T1 client (Pyodide) |
| `bash` | 151 | none. Shell is not offered (see 4.2) |
| `go` | 141 | T2 server |
| `yaml` | 88 | none (config). Validation possible later |
| `sql` | 76 | T1 client (sql.js); T2 for Postgres dialect |
| `javascript` | 72 | T1 client (sandboxed iframe) |
| `java` | 60 | T2 server |
| `typescript` | 58 | T2 server (transpile) or T1 later |
| `cpp` | 50 | T2 server |
| `json` | 44 | none |
| `hcl` | 31 | none (terraform validate is a later option) |
| `http` | 21 | none |
| `rust` | 19 | T2 server |
| `c` | 17 | T2 server |
| `dockerfile`, `nginx`, `ini`, `xml`, `csharp`, `rego`, `graphql`, others | 1-15 each | none for v1 |

Rough reading: about **425 blocks** (python + sql + javascript) are candidates for client-side execution. About **290 blocks** (go, java, cpp, rust, c, plus typescript) need a server runner. Most blocks are illustrative fragments, not complete programs, so the first pass needs a "runnable" marker (section 7.1). Only blocks an author opts in should run.

Lab-style content is thin:

- `content/cybersecurity/ai-security/prompt-injection-lab-safe-local-demo.md` (Python fences; the ai-security folder as a whole has 21 Python blocks)
- `content/cybersecurity/security-fundamentals/analyze-phishing-email-lab.md`
- 38 markdown files have a heading containing lab, exercise, challenge or hands-on.

So guided labs are a small catalogue today. Demand must be validated before the expensive tier is built.

Assessment question banks are not stored in `content/`. The `content/` JSON files contain no `"questions"` key, so the live assessment count must come from the database. **[verify]**: the number of published `ASSESSMENT` courses and their question counts.

### 1.6 Existing AI and tutor plans (AI_LAYER.md)

- The AI layer is off by default, server-side only, with per-feature flags, daily and monthly budgets, and a validated output gateway. It has no tools, no function calling, and no browsing.
- The tutor retrieves published chunks, including code fences (kept intact, ~1200-char chunks). Tutor answers are Markdown text, not HTML.

Implications for code execution:

- **The tutor may suggest code. It must never execute code on the user's behalf.** Any run is an explicit user action and goes through the same quota as a normal run. Tutor-generated snippets can be run only in the client tier.
- Per-minute AI limits are per instance. Runner quotas must not repeat that gap.
- The AI "no tools" rule is preserved. The tutor does not get a runner tool in any phase of this plan.

### 1.7 Existing API contract (API_LEARNING_LOOP.md)

Envelope `{success, data}`, errors `{success:false, message}`. Assessment routes are listed in section 2 of that doc. Code execution follows the same envelope. Its error-code style (AI_LAYER.md: `{success:false, code, message}`) should be reused for runner errors so the frontend treats them consistently.

---

## 2. Research Findings (2026)

Each entry is what the source says. Where the source is a third-party aggregator or the page did not show the value, it is flagged.

### 2.1 Server-side execution engines

**Judge0 (CE)**
- License: GPL-3.0. Source: https://github.com/judge0/judge0 ("Judge0 is licensed under the GNU General Public License v3.0").
- Latest tagged release: **v1.13.1, 2024-04-18**; the earlier one is v1.13.0 from 2021-03-10. Source: https://github.com/judge0/judge0/releases. No 2026 tag was found.
- Maintenance: a third-party analysis reports recent default-branch pushes in late September 2026 and a few active committers. Treat as **[verify]**. The releases page does not show it.
- Deployment red flag: the official `docker-compose.yml` runs the `server` and `worker` services with **`privileged: true`** and uses `judge0/judge0:latest` (not pinned). Source: https://raw.githubusercontent.com/judge0/judge0/master/docker-compose.yml.
- Security history: a third-party analysis (Hysen Labs) lists CVE-2024-28185 and CVE-2024-28189 as fixed in v1.13.1 and says older versions are affected. Source: https://hysenlabs.com/projects/judge0-judge0. **[verify]** against the GitHub security advisories before use.
- Its sandboxing is built on Isolate (the project thanks "Isolate, Docker, and Ruby on Rails"). Source: https://github.com/judge0/judge0.
- Hosted: https://ce.judge0.com/ documents the API.

**Piston (engineer-man)**
- License: **MIT**. Source: https://github.com/engineer-man/piston ("Piston is licensed under the MIT license").
- **The public API is closed.** The readme says: "The Piston API is no longer freely available to the public (as of Feb 15, 2026)." Keys are granted only "for good cause non-commercial educational projects", and the maintainer has "complete discretion on key issuance". GeekGully is not eligible as a commercial site. Source: same readme.
- Self-hosting is the stated path. Docker image `ghcr.io/engineer-man/piston`, started **with `--privileged`**, requires cgroup v2 for the all-in-one setup. Source: same readme.
- The repo shows active development and a 2026 copyright footer. It is not shown as archived. **[verify]** the date of the last release tag.
- Language packages are installable per runtime, which is useful for a language catalogue.

**Custom runner (build)**
- Go Playground precedent: it runs untrusted code inside gVisor (`runsc`) in a Docker container, on Container-Optimized OS VMs, with pre-started containers and hard limits of 5 s per run and 100 MB for binaries, output and memory. Source: https://github.com/golang/playground/blob/master/sandbox/sandbox.go (described in search results; exact constants **[verify]** in the file).

### 2.2 Browser-side runtimes

**Pyodide (CPython on WebAssembly)**
- License: **MPL-2.0**. Source: https://github.com/pyodide/pyodide/blob/main/LICENSE. File-level copyleft: changes to Pyodide's own files must be shared; using it unmodified in a closed app is generally fine, but get legal review for redistribution.
- Versions: the homepage shows 314.0.7 and the GitHub org shows commits in October 2026. Source: https://pyodide.org/ and https://github.com/pyodide/pyodide/releases. Pin an exact version in our bundle.
- Limits from the FAQ: packages with C extensions must be cross-compiled for Pyodide, and micropip fails if it cannot find a pure-Python wheel. Source: https://pyodide.org/en/stable/usage/faq.html. NumPy and similar packages are supported through Pyodide's own builds **[verify]** per package.
- Size: the initial download is large (several MB compressed for the core). **[verify]** on our own bundle. Lazy-load on first user action.

**sql.js (SQLite on WebAssembly)**
- License: **MIT** (SQLite is public domain). Source: https://github.com/sql-js/sql.js. No version or date was shown on the page **[verify]**.

**PGlite (PostgreSQL on WebAssembly)**
- License: dual **Apache-2.0 / PostgreSQL License**, per the README. Source: https://github.com/electric-sql/pglite. Recommended to read both license files before redistribution.
- Scope: single user and single connection, so it is suited to snippets, not concurrent clients. Third-party write-ups label it alpha **[verify]**.
- Use: Postgres-dialect SQL snippets where sql.js's SQLite dialect is wrong.

**TinyGo (Go to WebAssembly)**
- The official guide documents the browser target: `GOOS=js GOARCH=wasm tinygo build -o wasm.wasm ./main.go`. Source: https://tinygo.org/docs/guides/webassembly/wasm/. Standard-library and goroutine limits are on other pages **[verify]**.
- Practical read: compiling Go in the learner's browser is not realistic in v1. TinyGo is useful only for pre-built examples. Go execution is server-side (T2).

**WebContainers (StackBlitz)**
- Production use needs a license. Source: https://webcontainers.io/enterprise: "Licensing is required for production usage of the API in a commercial, for-profit setting." Prototypes and POCs do not need one. Customer-facing use also needs a license.
- Terms: production use requires an active plan or written license. Sources: https://stackblitz.com/terms-of-service and https://stackblitz.com/acceptable-use-policy.
- Price and usage thresholds are not on the page. An older FAQ mentioned a 10k-requests-per-month threshold; that could not be confirmed **[verify]** with StackBlitz.
- Decision: **not recommended** for v1. It is Node-centric, adds a commercial dependency, and our highest-value languages (Python, SQL) do not need it.

### 2.3 Ephemeral lab platforms

- **Killercoda**: https://killercoda.com/ is a site of interactive environments and certification prep. The fetched page did not describe session limits, the hosting model, or a commercial offering. Treat it as a UX reference, not a building block.
- **Play with Docker**: https://labs.play-with-docker.com/ offers a free Alpine VM in the browser and Swarm clusters. The fetched page says it is **scheduled to be unavailable from March 1, 2026**. Do not depend on it. **[verify]** the status.
- Conclusion: there is no reliable third-party platform to rent for branded, branch-specific labs at a predictable price. Self-built lab VMs are the realistic path, on a later phase.

### 2.4 Isolation technologies

| Technology | License (as stated) | What it isolates | Notes for us |
|---|---|---|---|
| Plain Docker (runc) + seccomp | Apache-2.0 (Docker) | Shared host kernel | Not acceptable as the only boundary for untrusted code at scale. Judge0 compose does this with `privileged: true`. |
| **gVisor (runsc)** | Apache-2.0 **[verify]** (not on the fetched docs page; the GitHub repo is Apache-2.0) | Userspace kernel (Sentry) plus a Gofer per container; the host kernel does not see the app's syscalls directly | Good default for a shared-VM runner. Higher syscall overhead and some incompatibilities (`/proc`, `/sys`). Source: https://gvisor.dev/docs/ and https://gvisor.dev/docs/architecture_guide/security/. |
| **Kata Containers** | Apache-2.0 | Lightweight VM per workload with a dedicated guest kernel; QEMU, Cloud-Hypervisor or Firecracker | Stronger boundary than gVisor, more ops. Source: https://katacontainers.io/. |
| **Firecracker** | Apache-2.0 (some crosvm code BSD-3-Clause) | KVM microVM; boot under 125 ms and under 5 MiB overhead, as claimed by the project | Strongest per-run isolation for lab VMs. Used by E2B, Fly.io and others per the project page. Needs KVM (nested virtualisation on GCE). Source: https://firecracker-microvm.github.io/. |
| **isolate** | not confirmed on the fetched page **[verify]** | Linux namespaces and cgroups (no chroot confirmed) | The sandbox underneath Judge0 and CMS (contest systems). Good building block for a custom runner inside a gVisor or VM boundary. Source: https://github.com/ioi/isolate. |

Key point: **no single layer is enough.** The plan uses layered isolation: process sandbox (isolate or equivalent) inside a userspace kernel (gVisor) inside a dedicated VM pool that has no route to the internet or our internal services.

### 2.5 Hosting cost data

- **Cloud Run** pricing page: https://cloud.google.com/run/pricing. The fetched text was truncated and showed no figures. Figures recalled from memory (Tier 1, us-central1): about $0.000018 per vCPU-second and $0.000002 per GiB-second for instance-based billing, and $0.000024 and $0.0000025 for request-based billing, with a free tier. These are **[verify]**. Mumbai (asia-south1) appears in the instance-based list, but its rate was not found.
- **GCE VM pricing** for the runner pool and lab VMs was not retrieved. The model in section 8 uses placeholder rates (clearly marked) to be replaced from the GCP Pricing Calculator with asia-south1 selected.

---

## 3. Use Cases (ranked)

Ranking is by expected learner value per unit of build cost and risk, not by the order in the brief.

| Rank | Use case | Value | Build cost | Risk | Needs server exec? |
|---|---|---|---|---|---|
| 1 | **Runnable snippets in articles and lessons** (Python, JS, SQL) | High reach across 425 candidate blocks | Low (client only) | Low | No |
| 2 | **Auto-graded code exercises in assessments** (certificate-relevant) | High for trust and certificates | Medium | Medium (grading integrity, runner abuse) | Yes (T2) |
| 3 | **Code-review challenges for interview prep** (read a diff, find the bug, write a rubric answer) | Medium-high for careers content | Low-medium (content, rubric, no execution) | Low | No, or light (run tests on the server for a subset later) |
| 4 | **Guided labs for DevSecOps and cloud** (ephemeral VM per learner) | High, but small catalogue today (2 lab files plus ~38 lab-like pages) | High (orchestration, cost, abuse, legal) | High | Yes (T3) |

Notes:
- Rank 2 is the first use case that changes outcomes (it feeds the certificate flow via `courses.require_assessment_pass`).
- Rank 3 can ship before any runner exists, which makes it a good parallel track for content.
- Rank 4 needs demand proof. Before building T3, measure how many learners open the existing lab pages and how many finish them.

---

## 4. Execution Tiers and Architecture

### 4.1 Tier overview

| Tier | What runs | Where | Used for | Server cost | Phase |
|---|---|---|---|---|---|
| **T0** | Nothing (static, highlighted code) | Browser | Everything today | 0 | Existing |
| **T1** | Python (Pyodide), SQL (sql.js; PGlite for Postgres dialect), JavaScript (iframe) | Browser, in a sandboxed Web Worker or iframe | Snippets, ungraded practice, visible-test checks | 0 (CDN egress only) | Phase 1 |
| **T2** | Go, Java, C/C++, Rust, C, TypeScript (transpiled), Python with server packages | Server sandbox (Judge0 or Piston spike, else custom) | Playground runs, graded assessment questions | Compute pool, ~$600/mo baseline (section 8) | Phase 2 (graded), Phase 3 (playground) |
| **T3** | Full lab environments (shell, cluster, a vulnerable target) | Ephemeral Firecracker/Kata microVM per learner, egress-locked | DevSecOps and cloud labs | Per session, roughly $0.15-0.30 each (section 8) | Phase 5 |

### 4.2 What is deliberately not offered

- **Interactive shells in T2.** A bash or shell prompt in the playground is an open door. Shell belongs to T3 only, inside a VM.
- **Network access from user code in T1 or T2.** No outbound network from runners. Pyodide and sql.js need no network after load.
- **User-supplied binaries or packages in T2.** Packages come from a pinned, per-language image.
- **Long-running processes** (servers, daemons). Wall clock per run is capped at 10 s for T2 and 5 s for T1 unless a case is approved.

### 4.3 T1: client-side architecture

- Pyodide, sql.js and PGlite load **lazily, on the learner's first Run click**, from a pinned version on our CDN (or jsDelivr with an exact version). They must not load on page view.
- JavaScript runs in a **sandboxed iframe** with `sandbox="allow-scripts"` (no `allow-same-origin`), so it gets an opaque origin, has no access to our cookies, storage or DOM, and cannot call our API. A strict CSP inside the iframe sets `connect-src 'none'`. Output is posted back with `postMessage` and rendered as text.
- Python runs in a **Web Worker** started from that same sandboxed document. The worker has a hard timeout enforced by the main thread (terminate and recreate the worker). Infinite loops cannot freeze the page.
- Each run is a fresh worker or fresh interpreter state. Global state does not leak between runs.
- **[verify]**: whether a Worker started inside an opaque-origin iframe can load Pyodide's CDN assets under our CSP. Phase 1 spike.

### 4.4 T2: server runner architecture

Three options are compared in section 4.5. The recommended flow is the same for any engine:

```
Browser ──HTTPS──► GeekGully API (go-cms)
                    ├─ auth, CSRF, quota ledger (DB), rate limit, source size limits
                    ├─ writes code_submissions row (status=queued)
                    └─ HTTPS over private network (mTLS or shared secret from env)
                              ▼
                    Runner service (private subnet, no internet egress)
                    ├─ engine: Judge0 CE | Piston | custom (isolate-based)
                    ├─ per-run: isolate sandbox, rlimits, wall-clock timeout, no network
                    └─ runs in gVisor (runsc) on dedicated VMs (not privileged containers)
                              ▼
                    results → go-cms → code_submissions (stdout truncated, exit, time, mem)
```

Rules for T2:
- The runner is **never** reachable from the browser. Only go-cms calls it.
- Runner nodes have no route to Cloud SQL, to the admin network, or to the internet (egress deny; package installs happen at image build time, not at run time).
- Engine containers are **not** `privileged`. If an engine requires it (as the Judge0 and Piston docs do), it runs inside a gVisor boundary or a VM instead, and the spike must prove the privileged flag is not needed for the chosen configuration.
- Images are pinned by digest. A rebuild is a deliberate change.
- Every run is capped by: wall time (10 s default), CPU time, memory (256 MB default), output bytes (64 KB), processes (64), open files, and source size (32 KB). Limits are enforced by the sandbox, not only by the API.

### 4.5 Engine decision (T2): Judge0 vs Piston vs custom

| Criterion | Judge0 CE | Piston (self-hosted) | Custom (isolate + gVisor, Go) |
|---|---|---|---|
| License | GPL-3.0; internal, unmodified use does not trigger source release. Legal review for any modification | MIT | Ours |
| Public hosted API for us | Judge0 CE public API exists; not assessed for commercial terms **[verify]** | Closed to new public users since Feb 15, 2026 | n/a |
| Last tagged release | v1.13.1, 2024-04-18 | not confirmed **[verify]** | n/a |
| Privileged container in official deploy | Yes (`server`, `worker`) | Yes (`--privileged`) | Not needed by design |
| Grading fit (stdin, expected output, limits, callbacks) | Strong: built for judging | Good for running; grading is ours | Built to our spec |
| Language catalogue | Large, many languages | Large, package-based | Start with 5 (Go, Java, C/C++, Rust, Python-server) |
| Ops burden | Medium (Postgres, Redis, workers) | Medium | High (we own the sandbox) |
| Security review burden | High: must be hardened and pinned | High: same | High, but we control the surface |
| Time to first run | Days | Days | 3-4 weeks |

**Recommendation:** Time-boxed spike (Phase 0, 3-4 days) of **Judge0 CE** and **Piston** side by side, behind the private network, using gVisor and no privileged flag. Choose by three measurements: p95 latency for 5 test cases, hardening effort, and whether the engine can be run unprivileged. If neither passes, build the custom runner (Phase 2 becomes 4-5 weeks longer). Do not expose either engine's public API to the browser. Do not buy a hosted executor until the cost in section 8 is compared with the vendor's quote.

### 4.6 T3: lab VMs (later phase)

- One Firecracker or Kata microVM (or a GCE VM with nested virtualisation for the spike) per learner per lab session.
- Boot from a pre-built, pinned image (cloud CLI, Kubernetes single node, deliberately vulnerable apps for security labs).
- Network: per-session VPC or firewall rules. Allow only the lab's own target hosts. Deny internet egress by default. Deny access to GeekGully internal services and metadata endpoints (`169.254.169.254`).
- Lifecycle: session TTL (default 60 min, max 120), idle timeout (15 min), hard teardown job every minute, snapshot-free. Logs go to our store, not the VM.
- Access: browser terminal via a websocket gateway with per-session token; no SSH keys from the learner.
- Cloud labs must never use real cloud credentials. Labs get a **sandbox cloud account or a local emulator**, with budget alarms and a deny list.
- This tier is a separate phase (section 10, Phase 5) because it needs orchestration, abuse monitoring, legal review and a security test before launch.

---

## 5. Security Threat Model

Scope: T1, T2 and T3 unless noted. Each threat lists the mitigation to build and the phase in which it must be in place.

| # | Threat | Where | Mitigation | Phase |
|---|---|---|---|---|
| S1 | **Untrusted code escapes the sandbox** (kernel exploit, runc or Judge0 CVE) | T2, T3 | Layered isolation (section 4.4): process sandbox inside gVisor inside VMs; no privileged containers; images pinned by digest; patch SLA (critical within 7 days); engine version check in CI | P2 |
| S2 | **Resource exhaustion** (fork bomb, memory bomb, huge output, deep recursion) | T1, T2 | Hard rlimits in sandbox; output truncation at 64 KB; source 32 KB; worker termination in T1; per-user concurrent run limit (2 T2, 1 T1 for free) | P1 (T1), P2 (T2) |
| S3 | **Network egress** (exfiltration, SSRF to internal services, outbound attacks) | T1, T2, T3 | T1: iframe CSP `connect-src 'none'`. T2: no route out, deny metadata endpoint, no DNS. T3: per-session firewall, allow-list only lab hosts | P1, P2, P5 |
| S4 | **Secrets exposure** (env vars, runner tokens, DB creds reachable from user code) | T2, T3 | Runner has no secrets. Runner-to-API token is scoped, rotated, and held by go-cms only. Lab VMs never receive GeekGully or cloud credentials; cloud labs use sandbox accounts | P2, P5 |
| S5 | **Crypto mining and abuse of compute** | T2, T3 | CPU quota per run and per user per day; no network so pools are unreachable; anomaly alert on sustained CPU per VM; account suspension after repeated limit hits | P2, P5 |
| S6 | **Abuse of the AI tutor to generate code that is then executed** | AI + T1/T2 | Tutor never runs code (section 1.6). Tutor-suggested snippets go only to the client tier. Quotas apply to every run regardless of origin. Tutor output stays text, no HTML | P1 |
| S7 | **XSS via outputs** (stdout or HTML from user code injected into the page) | T1, T2 | Output rendered as text nodes only (`textContent`), never `innerHTML`. ANSI escape codes stripped. No HTML or SVG rendering from user code. Images (matplotlib-style) only as PNG blobs with size limit. Output never passed through `sanitizeHtml` as trusted markup | P1 |
| S8 | **XSS via the content pipeline** (runnable attributes in `htmlParser`/`sanitize`) | Frontend | Escape `lang` in `htmlParser.ts` line ~488 (Phase 0). Runnable config is looked up by block id from a server-side map or by a validated language allow-list, not from free attributes. Add tests that `data-*` attributes are only the allowed ones | P0, P1 |
| S9 | **Hidden test or answer leakage** (tests in metadata, error messages revealing expected output, timing side channel) | Assessments | Tests in their own table, never in metadata (section 6). Runner errors are generic. Public responses show visible tests only. Automated test that greps every public response for hidden-test fingerprints | P2 |
| S10 | **Cheating and collusion** (copied solutions, shared accounts) | Assessments | See section 6.3 | P2 |
| S11 | **Offensive-security content misuse** (labs that attack real systems or ship weaponised payloads) | T3, content | Policy in 5.1 below. Labs target only local or sandboxed targets. Egress deny. Content review by the content-engine safety rules | P5 |
| S12 | **Privacy** (source code retained indefinitely, learner data sent to third parties) | Data | Retain submissions 90 days by default (configurable); source is user-owned and deletable; no code sent to third-party APIs except the existing AI provider, and only when the learner asks for AI help | P2 |
| S13 | **Denial of wallet** (runaway T2 or T3 spend) | Cost | Per-user daily quotas; global monthly budget with an `app_settings` kill switch (mirrors `ai.budget.monthly_usd`); lab session cap per user; billing alerts | P2, P5 |
| S14 | **Supply-chain** (malicious language image, compromised package) | T2, T3 | Images built from pinned base digests, SBOM, signed images, no package install at run time | P2 |

### 5.1 Security content policy (labs and code-review challenges)

- A lab may demonstrate an attack only against a target **we own** or a deliberately vulnerable app inside the lab network. No lab may send traffic to a real public host or an external IP.
- No lab may ship a working payload for a current, unpatched, real-world product. Use CVEs that are old, patched and documented, or write intentionally vulnerable code.
- Phishing, credential-theft and malware labs use synthetic data only and say so in the lab text.
- Each lab gets an owner, a safety review against the `geekgully-content-engine` safety rules (offensive-security and AI-security content), and a sign-off from the security reviewer before publication.
- Legal review (owner decision) for: jurisdiction of the lab VMs, India IT Act exposure for any tool that could be seen as enabling attacks, and whether labs with network scanning need a notice to learners. Counsel must confirm; this plan is not legal advice.

---

## 6. Grading (server-side assessments)

### 6.1 Principles

- **Answers and hidden tests never reach the client.** The client gets the prompt, starter code and visible example tests only.
- **Grading happens on the server.** The browser's result is never trusted. Client-side Pyodide runs are practice only and are never a grade.
- **Deterministic runs.** No network, fixed locale and timezone (UTC), seeded randomness, fixed time limits.
- **The grade is a function of test results only.** Explanations, rubrics and LLM feedback are separate and never change the score.

### 6.2 Flow (Phase 2)

1. Learner calls `POST /api/assessments/:id/attempts` (existing). The attempt is open.
2. Each code question is answered with `POST /api/assessments/:id/attempts/:attemptId/code-submissions` `{questionId, language, source}`. Server stores the submission (status `queued`), enforces quota, and calls the runner once per test case, in one batch.
3. Results are compared with `expected_stdout` after normalising trailing whitespace and line endings. The response shows visible test results in full and hidden tests as counts only (`passedHidden: 3/5`).
4. Final submit (existing `/submit`) takes the best passing submission per question and scores the attempt. The score uses the same `passMark` logic as multiple choice.
5. Attempts are one-shot per submit, matching the existing `409` behaviour. Code submissions are unlimited within the daily quota until final submit.

### 6.3 Anti-cheat basics (proportionate)

- **Per-attempt variation.** Hidden tests use parameterised inputs chosen per attempt from a seeded set, so one shared answer does not pass for everyone.
- **Duplicate detection.** Hash normalised source per question; flag exact or near-exact matches across users (for example, normalised token Jaccard above 0.95) for review, never automatic penalty.
- **Paste signal only.** Record that a large paste happened (length and timing), not keystrokes. Use as a review signal, not a score.
- **Rate limits.** Max submissions per question per hour; cooldown after repeated identical submissions.
- **Review queue.** Admin view of flagged submissions. No automated failing based on heuristics alone.
- **Honest limit.** Anyone can use an AI assistant offline. Assessments that matter for certificates should include a short written or verbal component later. This is an open decision (section 11).

### 6.4 Grading for other formats

- SQL questions can be graded against a throwaway Postgres schema per attempt (cheap, deterministic, and read-only), not only in sql.js. Phase 2 option.
- Code-review challenges (section 3, rank 3) are rubric-graded by a human reviewer, or AI-assisted with the reviewer confirming. The AI score is never final.

---

## 7. Frontend Integration

### 7.1 Authoring convention (no schema change in v1)

Use a fence info-string marker that the existing parser can read:

````
```python run
print(sum(range(10)))
```
````

- `htmlParser.ts` already reads the language from `fenceMatch[1]` (line ~130). Extend it to split on whitespace: `language = "python"`, `flags = ["run"]`. Unknown flags are ignored, so older renderers degrade to a plain block.
- The HTML emitted for a runnable block is `<div class="code-block" data-code-run="python">`. **This requires an allow-list change in `sanitize.ts`** (`ALLOW_DATA_ATTR` is false), and the attribute value must be checked against the runtime allow-list (T1: python, javascript, sql). Better: emit a block id and let the client look up the language from its own allow-list.
- Imported content (`import_manifest.json`) uses the same parser, so existing imports need no migration. Authors add the `run` flag to selected blocks only.

### 7.2 Component: `RunnableCode`

Props: `language`, `code`, `filename?`, `mode: 'practice' | 'graded'`, `tests?` (visible examples, graded mode only).

UI:
- Header: language badge, filename, **Copy**, **Run** (primary), **Reset** (back to original code).
- Editor: start with a plain `<textarea>` with monospace font, `spellCheck=false`, `autocapitalize="off"`, tab inserts two spaces, Esc moves focus out (so keyboard users are not trapped). Syntax highlighting after v1 with a lazily loaded editor (CodeMirror 6 is a candidate; bundle size **[verify]**).
- Stdin panel (collapsed by default), shown only where the runtime uses stdin.
- Output pane: `role="log"` with `aria-live="polite"` for result announcements. Monospace, horizontal scroll, text only.
- Status line with states (below).
- Mobile: full-width block, horizontal scroll on code and output, Run button at least 44 px tall, stdin and output stacked. No hover-only controls.

States and copy:

| State | What the learner sees |
|---|---|
| Idle | "Run" enabled |
| Loading runtime (T1 first use) | "Loading Python runtime (about N MB, once per session)…" with progress |
| Running | Spinner; Run becomes "Stop" |
| Success | Output; exit code 0 shown quietly |
| Error (exit != 0) | Stderr in the error style, first traceback line highlighted |
| Timed out | "Stopped after 5 seconds. Check for loops that never end." |
| Output truncated | "Output shortened to 64 KB." |
| Quota exceeded (T2) | "You have used today's runs. Resets at 00:00 IST." with the limit from the API |
| Runtime unavailable | "Runner is not available right now" (code `CODE_NOT_CONFIGURED` or `CODE_UNAVAILABLE`, same pattern as AI) |
| Offline | "You are offline. Run needs the runtime loaded once." |

Accessibility: keyboard only operation tested; focus returns to output after run; colour is not the only signal; reduced-motion respected; screen reader announces state changes once, not per output line.

### 7.3 Hydration

- `PublicArticleView.tsx` and `CourseViewPage.tsx` already call `hljs.highlightElement` on blocks after render (lines ~240 and ~331). Add a step that mounts a `RunnableCode` React root into each `[data-code-run]` placeholder after highlighting, using `createRoot` in a `useEffect`. Unmount on route change.
- The placeholder must keep the original code as plain text so the page still works with JavaScript off or if the component fails.

### 7.4 Editor (TipTap, Phase 2)

- Add a `runnable` attribute to the code-block node (TipTap extension) so authors can toggle Run in the existing InlinePageEditor. Round-trip to the stored body format must preserve the flag. Test round-trip explicitly, because the editor stores TipTap JSON for `contentFormat: 'tiptap'` (InlinePageEditor line ~59-62).

### 7.5 Assessment UI (Phase 2)

- `AssessmentTaker` gets a code-question branch: prompt, `RunnableCode` in graded mode, a "Check against examples" button (visible tests only), and a final submit that goes through the existing submit route.
- `AssessmentDefinitionDto.questions[]` gains `type: 'mcq' | 'code'`, `language?`, `starterCode?`, `exampleTests?`. Existing MCQ clients keep working because `type` defaults to `mcq`.

### 7.6 Analytics

Events (content type `COURSE` or `ASSESSMENT`, per API_LEARNING_LOOP.md section 4): `code_run` (tier, language, status, duration bucket), `code_run_error`, `code_check_passed`, `code_check_failed`. No source code or output text in analytics.

---

## 8. Cost Model

### 8.1 Assumptions (explicit; replace with real numbers)

| ID | Assumption | Value | Source |
|---|---|---|---|
| A1 | Monthly active learners | 20,000 | **Placeholder**, owner to confirm |
| A2 | Learners who run code on the server each month | 3,000 (15% of MAU) | Placeholder |
| A3 | Playground runs (T2) per month | 40,000 | Placeholder: about 13 per active server-runner learner |
| A4 | Graded submissions per month | 5,000 | Placeholder |
| A5 | Test-case executions per graded submission | 6 (5 tests + compile) | Design assumption |
| A6 | Average wall time per T2 execution | 1 s | Design assumption (10 s cap) |
| A7 | Peak-to-average ratio | 10x | Design assumption |
| A8 | Runner node | 8 vCPU / 32 GB general-purpose VM, **$0.40 per node-hour** | **Placeholder** [verify in GCP calculator, asia-south1] |
| A9 | Runner nodes (2 for HA) | 2 | Design |
| A10 | T1 first-use asset download | 15 MB per learner session | **[verify]** on our bundle |
| A11 | CDN egress price | $0.08 per GB | **Placeholder** [verify] |
| A12 | Lab VM (T3) | 2 vCPU / 4 GB, **$0.10 per VM-hour** | **Placeholder** [verify] |
| A13 | Lab sessions per month (Phase 5) | 1,500 at launch, 5,000 at target | Placeholder, depends on demand test |
| A14 | Lab overhead factor (boot, warm pool, teardown) | 1.5x | Design |
| A15 | Fully loaded engineering cost | $4,000 per person-week | **Placeholder** |

### 8.2 Monthly run cost

| Item | Calculation | Monthly cost (USD) |
|---|---|---|
| T1 client snippets (Phase 1) | 0 compute. Egress: 10,000 first-use sessions x 15 MB = 150 GB x $0.08 | about **$12** |
| T2 runner pool (Phase 2-3) | 2 nodes x 730 h x $0.40 = | about **$584** baseline |
| T2 capacity check | 70,000 executions x 1 s = about 19 vCPU-hours of work per month. Two nodes provide 2 x 8 x 730 = 11,680 vCPU-hours, so average utilisation is about 0.2%; the baseline is set by HA, not load | (no extra) |
| T2 if serverless (Cloud Run), recalled rates **[verify]** | 70,000 x (1 vCPU-s x $0.000018 + 0.5 GiB-s x $0.000002) plus about $0.03 of request fees | about **$1-3** before any free tier |
| Lab VMs T3 (Phase 5, launch) | 1,500 sessions x 1 h x $0.10 per VM-hour x 1.5 overhead | about **$225** |
| Lab VMs T3 (target) | 5,000 sessions x 1 h x $0.10 per VM-hour x 1.5 overhead | about **$750** |
| Logs, storage, backups for submissions | 90-day retention, source 32 KB max | under **$20** |

Per-unit numbers:
- T2 execution, amortised at baseline: about $584 / 70,000 = **about $0.008** per execution.
- T3 lab session at launch: $225 / 1,500 = **about $0.15** per session (matches the range in section 4.1).

### 8.3 One-off build cost

| Phase | Person-weeks | Cost at A15 |
|---|---|---|
| P0 Decisions and spikes | 1.5 | $6,000 |
| P1 Client snippets | 5 | $20,000 |
| P2 Graded code questions and runner | 7 (6-8) | $28,000 |
| P3 Playground | 3 | $12,000 |
| P4 Code-review challenges | 3 | $12,000 |
| P5 Guided labs | 14 (12-16) plus external pen test | $56,000 + pen test |

### 8.4 Vendor options (not budgeted)

- **Hosted Judge0 or other executor API:** price not found; ask for a quote. Compare against the $584 baseline plus ops time.
- **WebContainers commercial license:** price not published; production use requires a license (section 2.2). Not in budget.
- **Piston public key:** not available for commercial use (section 2.1).

### 8.5 Sensitivity

- If Cloud Run can host the runner (no privileged container, nested namespace support confirmed), the baseline falls from about $584 to under $10 per month. That makes the choice a technical one, not a financial one, at this volume.
- If lab demand is 5x the placeholder, T3 costs about $750 per month at 5,000 sessions. Costs stay manageable; the bigger risk is ops and abuse work, not VM price.

---

## 9. Data Model and API

### 9.1 New tables (migration `007_code_execution.sql`, idempotent like 003)

```text
code_runtimes
  id, language (e.g. 'python'), version (pinned), tier ('T1'|'T2'|'T3'),
  engine ('pyodide'|'sqljs'|'pglite'|'judge0'|'piston'|'custom'),
  image_digest, enabled BOOL, limits JSONB (wall_ms, mem_kb, output_bytes, source_bytes, procs),
  created_at, updated_at

code_exercises
  id, course_id (FK courses.id, the ASSESSMENT or lesson-owning course),
  question_key (string, matches question id in metadata),
  language, starter_code TEXT, prompt_ref,
  visibility_policy ('visible_examples'), created_at, updated_at

code_test_cases        -- NEVER returned by public endpoints
  id, exercise_id (FK), position INT, is_hidden BOOL, stdin TEXT,
  expected_stdout TEXT, weight NUMERIC(5,2), timeout_ms INT,
  created_at, updated_at

code_submissions
  id, user_id (FK users, ON DELETE CASCADE), exercise_id (FK, nullable for playground),
  attempt_id (FK assessment_attempts, nullable), language, source_bytes INT,
  source TEXT (max 32 KB, purged at retention_until), source_sha256 CHAR(64),
  status ('queued'|'running'|'passed'|'failed'|'error'|'timeout'|'oom'),
  passed_count INT, total_count INT, score NUMERIC(5,2),
  stdout_excerpt TEXT (max 4 KB), stderr_excerpt TEXT (max 4 KB),
  exit_code INT, wall_ms INT, mem_kb INT, engine_run_id TEXT,
  created_at, finished_at, retention_until TIMESTAMPTZ

code_quota_ledger      -- DB-backed, exact, unlike in-memory limiters
  user_id, day (UTC date), tier, runs INT, cpu_ms BIGINT,
  PRIMARY KEY (user_id, day, tier)

lab_definitions (Phase 5)
  id, slug, course_id, image_digest, ttl_minutes, targets JSONB, status

lab_sessions (Phase 5)
  id, user_id, lab_id, state ('provisioning'|'ready'|'expired'|'ended'|'failed'),
  vm_ref, network_ref, started_at, expires_at, ended_at, cost_micro_usd BIGINT
```

Notes:
- `source` is user content. Keep it out of logs and analytics. Purge by `retention_until` (a scheduled job).
- Hidden tests are rows in `code_test_cases`. The public serialiser has an explicit field allow-list, so hidden rows cannot leak through a generic JSON dump.

### 9.2 Endpoints

All responses use the existing `{success, data}` envelope. Errors use `{success:false, code, message}` (AI_LAYER.md pattern). Auth is the session cookie with CSRF on writes.

| Method and path | Auth | Phase | Purpose |
|---|---|---|---|
| `GET /api/code/runtimes` | public | P1 | Enabled languages, tiers, limits, versions |
| `POST /api/code/run` | user, verified email | P3 | Playground run `{language, source, stdin?}` returns `{submissionId, status, stdout, stderr, exitCode, wallMs, truncated}` |
| `GET /api/code/runs/:id` | owner | P3 | Result of a run (in case of a queued response) |
| `GET /api/code-exercises/:id` | user | P2 | Prompt, starter code, visible example tests. No hidden tests |
| `POST /api/assessments/:id/attempts/:attemptId/code-submissions` | user | P2 | Graded check: `{questionId, language, source}`. Returns visible results in full and hidden counts only |
| `GET /api/assessments/:id/attempts/me` | user | existing | Gains per-question code results |
| `PUT /api/cms/code-exercises/:id/tests` | admin (audited) | P2 | Replace test cases. Audit event `code.tests.updated` |
| `PUT /api/code/settings` | admin | P1 | Kill switch and limits (`app_settings`: `code.enabled`, `code.runner.enabled`, `code.labs.enabled`, `code.budget.monthly_usd`) |
| `POST /api/labs/:id/sessions` | user, verified | P5 | Start lab session; 409 if at per-user cap |
| `DELETE /api/labs/sessions/:id` | owner | P5 | End session early |

Error codes (new): `CODE_DISABLED`, `CODE_NOT_CONFIGURED`, `CODE_UNAVAILABLE`, `CODE_QUOTA_EXCEEDED` (429), `CODE_SOURCE_TOO_LARGE` (413), `CODE_LANGUAGE_UNSUPPORTED` (400), `CODE_RUN_TIMEOUT` (408 on synchronous path, status `timeout` in body), `LAB_SESSION_LIMIT` (409).

### 9.3 Quotas per tier and plan

Plan names are placeholders until the owner decides on paid plans (section 11).

| Limit | Anonymous | Free (verified) | Paid (placeholder) |
|---|---|---|---|
| T1 browser runs | Unlimited (no server call) | Unlimited | Unlimited |
| T2 playground runs per day | 0 | 20 | 200 |
| T2 concurrent runs | 0 | 1 | 3 |
| Graded submissions per day (all questions) | 0 | 30 | 150 |
| Wall time per run | n/a | 10 s | 10 s (same; abuse control is not price-based) |
| Memory per run | n/a | 256 MB | 256 MB |
| Output | n/a | 64 KB | 64 KB |
| Source size | n/a | 32 KB | 32 KB |
| Lab sessions concurrent | 0 | 0 (preview only) | 1 (later 3) |
| Lab session length | n/a | n/a | 60 min default, 120 max |
| Labs per day | 0 | 0 | 5 |

Quota logic: check the ledger in the same transaction as the insert (exact, DB-backed). Count queued and failed runs as used to block quota-farming with error loops.

---

## 10. Phases, Milestones and Exit Criteria

Team assumption: 1 full-stack engineer (Go and React), 0.5 security engineer, 0.25 content owner. Phases can overlap as marked.

### Phase 0: Decisions and spikes (1.5 person-weeks, 1 week elapsed)

Work:
- Fix `htmlParser.ts` `lang` escaping (S8) with a test.
- Spike A: Judge0 CE and Piston, unprivileged, under gVisor, on a private VM. Measure p95 for 5 test cases, cold start, and hardening effort.
- Spike B: Pyodide in a sandboxed iframe with Worker, CSP `connect-src 'none'`. Measure bundle size, first-run time on a mid-range Android phone, and that asset loading works under the CSP.
- Legal note on GPL-3.0 (Judge0), MPL-2.0 (Pyodide), Apache/PostgreSQL (PGlite), MIT (sql.js, Piston).
- Confirm A1-A15 with real data (MAU, article traffic, assessment counts).

Exit criteria:
- Go/no-go memo signed by owner with: engine choice, language list for P2, budget.
- Pyodide spike meets: first Run under 5 s on a mid-range phone on 4G after load; no CSP violations.
- Runner spike meets: p95 under 3 s for 5 tests, no privileged flag, sandbox blocks network and fork bomb in a test.

### Phase 1: Client-side runnable snippets (5 person-weeks)

Scope:
- Fence flag `run` (section 7.1), `RunnableCode` component (section 7.2), hydration (7.3), T1 runtimes for Python, JavaScript and SQL (sql.js). PGlite deferred unless a Postgres-dialect article is in the pilot.
- Pilot set: 20 articles or lessons chosen by owner (suggest 10 Python, 5 SQL, 5 JavaScript, from the 425 candidates).
- Analytics events (7.6). Feature flag `code.enabled` (default off).
- Tests: component tests, sanitiser tests for allowed data attributes, XSS tests on output rendering, keyboard tests.

Exit criteria:
- 90% of pilot runnable blocks run successfully on current Chrome, Safari (iOS and macOS) and Firefox, with the test matrix recorded.
- No LCP regression above 100 ms on pilot article pages (Pyodide not loaded on view).
- Zero server calls from T1 runs (verified by network log in a test).
- Zero open XSS findings from the test suite and manual review of output rendering.
- Accessibility: keyboard-only and VoiceOver/NVDA check passed on the component.

### Phase 2: Server-graded code questions (7 person-weeks, 6-8 range)

Scope:
- Migration 007 (section 9.1). `code_exercises`, `code_test_cases`, `code_submissions`, `code_quota_ledger`.
- Runner integration behind the private network, engine chosen in P0 (or custom if the spike fails, +4-5 weeks).
- Assessment definition gains `type: code` and parse changes in `questions.go` (type discriminator before the option check; extend `answerKeyFields` defensively).
- Endpoints in 9.2 for code exercises and code submissions. Admin test-case editor (API and minimal UI).
- `AssessmentTaker` code branch (7.5).
- Grading logic (section 6), anti-cheat basics (6.3), retention job (S12).

Exit criteria:
- 500 graded submissions in staging with under 2% infrastructure errors.
- Automated test confirms hidden tests and expected outputs never appear in any public or assessment-definition response (run against every public route that returns assessment data).
- p95 grading under 5 s for a 5-test question.
- Quota enforced exactly under concurrent load (test with 50 parallel requests per user).
- Security review of the runner (S1-S5, S14) signed off with no open high findings.

### Phase 3: Playground for compiled languages (3 person-weeks, can start after P2 runner is stable)

Scope:
- `POST /api/code/run` for Go, Java, C/C++, Rust (and Python-server if needed). Output streaming is out of scope; return on completion.
- Language catalogue with pinned images (`code_runtimes`).
- Playground UI reuses `RunnableCode` with `mode: practice`.

Exit criteria:
- Playground p95 under 3 s for hello-world-class programs, under 10 s hard cap enforced.
- Abuse monitoring live: alerts on CPU saturation, repeated quota hits, and egress attempts.
- Kill switch tested end to end.

### Phase 4: Code-review challenges for interview prep (3 person-weeks, parallel with P2/P3)

Scope:
- Content type `code_review_challenge`: a snippet with a planted bug or design issue, a rubric, a model answer, and optional visible tests (run via T1 where possible).
- Submission is free text; grading by rubric with a reviewer, optionally AI-assisted via the tutor's grounded path (AI_LAYER.md) with the reviewer confirming. The AI score is advisory only.
- Content authored under the `geekgully-content-engine` rules (no fabricated examples presented as real incidents).

Exit criteria:
- 20 challenges published, each reviewed by the content engine REVIEW mode with PUBLISH decision.
- Reviewer agreement check: two reviewers score 30 sample answers with Cohen's kappa at or above 0.6 **[set target with owner]**.

### Phase 5: Guided labs (ephemeral VMs) (14 person-weeks, 12-16 range, plus external pen test)

Scope:
- Lab definitions, image pipeline, microVM pool (Firecracker or Kata; GCE nested virtualisation first for the spike).
- Per-session network isolation, TTL and teardown job, websocket terminal gateway with session tokens, cost ledger (`cost_micro_usd`).
- Two pilot labs: one cloud (sandbox account or emulator), one DevSecOps (local vulnerable app). Both must pass the content safety review (5.1).
- Pen test by an external firm covering escape from the VM, egress from the lab network, and metadata endpoint access.

Exit criteria:
- 99% of sessions torn down within 5 minutes of expiry (measured for four weeks).
- Pen test: no high or critical findings open; zero successful egress to non-allow-listed hosts in the test matrix.
- Cost per session under the budget set by the owner (placeholder $0.20).
- Legal sign-off on jurisdiction, notices, and content.

---

## 11. Risks and Open Decisions for the Owner

### 11.1 Decisions needed

1. **Languages first.** Recommended: Python (T1), SQL (T1), JavaScript (T1) for Phase 1; Go, Java, C/C++, Rust for Phase 2-3. TypeScript only after Go works. Confirm or cut.
2. **Engine.** Approve the P0 spike of Judge0 CE vs Piston, with a fallback to a custom runner. Do not approve a commercial executor until the quote is in.
3. **Budget.** Approve Phase 1 (about $20k at placeholder rates) and Phase 2 (about $28k) before Phase 3-5 are scoped. Replace A15 with the real loaded cost.
4. **Paid plans.** Do the quotas in 9.3 need a paid tier? The product's plan model is not in this repo's review docs. Confirm.
5. **Certificate integrity.** Whether code-graded assessments that issue certificates need a proctoring or oral component. Trade-off: cost and friction vs cheating risk.
6. **Lab scope.** Which cloud provider(s) for labs, and whether to use a provider sandbox account or an emulator. Confirm the lab catalogue first, using demand data from the existing lab-style pages (about 38 headings plus 2 lab files).
7. **Legal.** Counsel review of offensive-security labs (India IT Act exposure, notices, lab VM jurisdiction) and of the licences in section 2 for our intended use.
8. **Retention.** 90-day default for submissions, or shorter.
9. **Hidden-test ownership.** Who writes and reviews hidden tests (content team or engineers), and how changes are audited.

### 11.2 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Judge0 or Piston needs privileged containers and cannot be hardened to our standard | Medium | High | P0 spike with explicit pass or fail criteria; custom runner fallback costs 4-5 weeks |
| Piston public API closure forces self-host with unknown maintenance | Confirmed | Medium | Do not depend on the public API; self-host or drop Piston |
| Judge0 maintenance and CVE history | Medium | High | Pin version, subscribe to advisories, patch SLA; treat as untrusted engine behind gVisor |
| Pyodide load time and memory on low-end Android | High | Medium | Lazy load on Run; show size and progress; test on a mid-range device in P0 |
| Browser differences (Safari WebAssembly memory limits, iOS) | Medium | Medium | Test matrix in P1; graceful "not supported on this browser" state |
| Learners paste graded answers from AI tools | High | Medium | Section 6.3 and an honest disclosure; open decision 5 |
| Crypto mining or abuse on the runner | Medium | High | No egress, CPU caps, daily quotas, anomaly alerts, kill switch |
| Offensive-lab content creates reputational or legal exposure | Medium | High | Section 5.1 policy, content-engine review, counsel review before P5 |
| Cost overrun on T3 (labs) from idle or stuck VMs | Medium | Medium | TTL, idle timeout, minute-level teardown job, budget kill switch |
| Quota bypass via multiple accounts | Medium | Medium | Verified email for runs, per-IP and per-account limits, DB-backed ledger |
| XSS through runnable blocks or output | Low (with mitigations) | High | S7 and S8 mitigations; tests in P0-P1; security review |
| Scope creep into a general IDE | High | Medium | Non-goals: no multi-file projects, no package installs, no shell in T2 |
| Parser change breaks imported content | Low | Medium | Flag is opt-in; unknown flags ignored; regression tests on import fixtures |
| Assessment data model change breaks existing MCQ | Low | High | `type` defaults to `mcq`; regression tests on `questions.go`; migration is additive |

### 11.3 Non-goals (v1 to Phase 3)

- No multi-file projects or IDE features.
- No package installation by learners.
- No shell in T2.
- No persistent environments between sessions.
- No grading from browser-side results.
- No AI tutor execution of code.

---

## 12. Sources

Runners and engines
- Piston repository and readme (license, public API status, self-host): https://github.com/engineer-man/piston
- Piston releases: https://github.com/engineer-man/piston/releases
- Judge0 repository (license, isolation notes): https://github.com/judge0/judge0
- Judge0 releases (v1.13.1 dated 2024-04-18): https://github.com/judge0/judge0/releases
- Judge0 docker-compose (`privileged: true`, `judge0/judge0:latest`): https://raw.githubusercontent.com/judge0/judge0/master/docker-compose.yml
- Judge0 CE API docs: https://ce.judge0.com/
- Third-party Judge0 analysis (CVE mention; **verify**): https://hysenlabs.com/projects/judge0-judge0

Browser runtimes
- Pyodide repository and LICENSE (MPL-2.0): https://github.com/pyodide/pyodide and https://github.com/pyodide/pyodide/blob/main/LICENSE
- Pyodide site (version 314.0.7 shown): https://pyodide.org/
- Pyodide FAQ (micropip, pickle warning): https://pyodide.org/en/stable/usage/faq.html
- sql.js (MIT): https://github.com/sql-js/sql.js
- PGlite (Apache-2.0 / PostgreSQL License, single connection): https://github.com/electric-sql/pglite
- TinyGo WebAssembly guide: https://tinygo.org/docs/guides/webassembly/wasm/
- WebContainers enterprise licensing: https://webcontainers.io/enterprise
- StackBlitz Terms of Service: https://stackblitz.com/terms-of-service
- StackBlitz Acceptable Use Policy: https://stackblitz.com/acceptable-use-policy

Labs
- Killercoda: https://killercoda.com/ (no operational detail found)
- Play with Docker (page says unavailable from March 1, 2026): https://labs.play-with-docker.com/

Isolation
- gVisor docs: https://gvisor.dev/docs/
- gVisor security model: https://gvisor.dev/docs/architecture_guide/security/
- Go Playground sandbox source (gVisor, run limits): https://github.com/golang/playground/blob/master/sandbox/sandbox.go
- Firecracker: https://firecracker-microvm.github.io/
- Kata Containers: https://katacontainers.io/
- isolate sandbox: https://github.com/ioi/isolate

Hosting pricing
- Cloud Run pricing (fetched text truncated; rates **verify**): https://cloud.google.com/run/pricing

Repo references (local)
- `gocms/gg-cms/frontend/react-ui/src/lib/htmlParser.ts`, `lib/sanitize.ts`, `components/assessment/AssessmentTaker.tsx`, `pages/PracticeHub.tsx`, `pages/CourseViewPage.tsx`, `pages/PublicArticleView.tsx`, `components/editor/InlinePageEditor.tsx`
- `gocms/gg-cms/backend/go-cms/internal/application/assessment/questions.go`
- `gocms/gg-cms/backend/go-cms/migrations/postgres/003_learning_loop.sql`, `006_ai.sql`
- `gocms/gg-cms/backend/go-cms/internal/interfaces/http/router.go`
- `gocms/docs/product-review/API_LEARNING_LOOP.md`, `gocms/docs/product-review/AI_LAYER.md`
- `gocms/content/` (542 markdown files; fence counts in section 1.5)
