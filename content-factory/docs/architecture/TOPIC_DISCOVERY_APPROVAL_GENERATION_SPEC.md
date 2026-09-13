# Topic Discovery, Approval, and Generation Specification

## 1. Purpose

This specification defines the required flow for the content factory so that a user can:

1. discover topical opportunities,
2. review and approve the ones that are valuable,
3. generate content only for approved topics,
4. write in a teacher-led storytelling style that opens with a scenario and problem, then explains the approach and solution with pros and cons,
5. hide advanced or optional generation controls until the user explicitly asks to see them.

This requirement is intentionally opinionated: content generation must be topic-first, approval-first, and user-centered.

---

## 2. Product requirement summary

The user experience must follow this sequence:

- The user creates or selects a project.
- The project has a niche, audience, content types, brand voice, and strategy.
- The system discovers opportunities from the project niche or from a user-provided topic.
- Discovered opportunities appear as candidate topics.
- Each candidate is reviewed as a discovered opportunity and can be approved or rejected.
- Only an opportunity in the approved state may be used to launch generation.
- Generation requests must attach to a specific approved opportunity and cannot bypass approval.
- Generation output must be written in a teaching voice that helps the audience understand the problem, the approach, the trade-offs, and the practical answer.

This keeps the experience aligned with real editorial quality and prevents low-quality topic generation from bypassing review.

---

## 3. User flow specification

### 3.1 Discovery flow

The user enters either:

- a project niche, or
- an explicit statement/topic such as "AI security for startups".

The system calls the discovery engine, which expands the input into candidate topics and scores them.

The discovered opportunities are stored with fields such as:

- topic
- score
- demand
- trend
- competition
- content_gap
- audience
- recommended_content_type
- reason
- brief
- references
- status

The discovery pipeline must not automatically generate content from these topics without approval.

### 3.2 Approval flow

In the Discoveries area, the user sees a list of found topics in the DISCOVERED state.

Each row must show:

- topic name
- score
- reason
- status
- approve / reject actions

The user can approve a topic only when it is relevant, grounded enough, and aligned with the project goals.

Approved opportunities become eligible for content generation.

### 3.3 Generation flow

The Generation page only shows approved opportunities in its selection dropdown.

If there are no approved opportunities, the user sees a clear message:

- "No approved opportunities yet -- approve one in Discoveries first."

The generation form must require a selected approved opportunity before the submission button becomes active.

This enforces the rule that content must come from a topic that has already been discovered and approved.

---

## 4. UX rules for a user-first experience

### 4.1 Hide advanced settings by default

The generation form must keep the most important fields visible by default:

- approved opportunity
- content type
- primary generation action

Advanced settings such as:

- difficulty
- target length
- audience override
- knowledge packs
- web research toggle

must be hidden behind an explicit "Show" / "Hide" control unless the user chooses to open them.

This reduces cognitive load and matches the requirement that options be customized and hidden when not explicitly needed.

### 4.2 Only surface options that are relevant

If a project already defines values like audience, content type, or project voice, those should be used as defaults and not forced as required input unless necessary.

Only explicit user actions should expose additional customization.

### 4.3 Visual guidance and guardrails

The UI should include a clear banner such as:

- "Topic-first workflow: discover a topic, review its opportunity, and only then start generation."

This makes the model and the workflow understandable from the user’s perspective.

---

## 5. Functional specification

### 5.1 Required data model behavior

The system must enforce the topic lifecycle as follows:

- DISCOVERED -> approved or rejected
- APPROVED -> eligible for generation
- REJECTED -> excluded from generation and optionally placed into cooldown

No generation job may be created from a topic whose status is not APPROVED.

### 5.2 Backend enforcement requirement

The generation API must validate that the supplied opportunity belongs to the project and has status APPROVED.

The server should reject attempts to generate content for:

- a missing opportunity
- an opportunity belonging to another project
- a DISCOVERED or REJECTED opportunity

This is a critical server-side guarantee because UX alone is not enough.

### 5.3 Generation job contract

The generation request payload must include:

- project_id
- opportunity_id
- content_type
- knowledge_pack_ids
- enable_web_research
- audience (optional)
- difficulty (optional)
- target_length (optional)

The output must be tied to the opportunity used for generation so provenance can be inspected later.

---

## 6. Writing and storytelling specification

### 6.1 Core voice requirement

The generated content must be written as if by the best teacher in a live classroom.

The writer must start from a real scenario or a real problem, then:

1. set up the scenario,
2. surface the pain point,
3. explain the approach,
4. show the solution,
5. compare pros and cons,
6. close with a practical takeaway.

The writing should feel encouraging and engaging for beginners, while still containing enough technical depth for experts.

### 6.2 Required narrative pattern

Each major section should follow this pattern:

- Scenario: a concrete real-world situation
- Problem: what is going wrong or what confusion the reader is experiencing
- Approach: what strategy or principle is being used
- Solving: how the idea addresses the problem
- Pros and cons: where it works and where it does not
- Practical takeaway: what the reader should remember

### 6.3 Audience engagement requirement

The writer must balance clarity with challenge:

- explain concepts simply before deepening them,
- make the reader feel guided rather than lectured,
- surface trade-offs honestly,
- call out pitfalls and alternatives,
- keep the writing lively without sacrificing factual accuracy.

### 6.4 Prompt guidance requirement

The writer prompt must explicitly instruct the model to:

- start with scenario and problem framing,
- move into approach and solution,
- compare pros and cons,
- keep it engaging for all levels,
- never invent factual claims not present in the evidence pack,
- maintain a teacher-like instructional flow rather than a dry reference tone.

---

## 7. Prompt specification

The following prompt principles are mandatory in the generation prompt:

- Start from a problem or scenario instead of dry definitions.
- Teach the material progressively.
- Use a mentor-like, encouraging tone.
- Explain not just what the system does, but why it matters.
- Show pros, cons, edge cases, and trade-offs.
- Keep the lesson grounded in the evidence pack.
- Respect the project brand voice while preserving educational clarity.

The current writer prompt was updated to enforce this behavior. The relevant prompt file is:

- [content-factory/backend/prompts/writer.md](../backend/prompts/writer.md)

The default project brand voice also reflects this requirement and is configured during project setup in:

- [content-factory/frontend/src/pages/Projects.tsx](../frontend/src/pages/Projects.tsx)

---

## 8. Hybrid LLM strategy and guardrails

The system should use a hybrid model, not a pure LLM-only pipeline.

### 8.1 Design principle

The correct pattern is:

1. use deterministic rules to constrain scope, compute score, and enforce approval gates,
2. use LLMs only for semantically rich gap-filling such as topic expansion, reasoning, and headline variation,
3. let explicit project data and upstream signals win over LLM guesses,
4. require a human approval step before any generation job can use a topic.

This prevents the model from drifting into generic “AI will figure it out” behavior that ignores the real user intent or the project’s editorial boundaries.

### 8.2 Required hybrid behavior

- Deterministic scoring is the source of truth for final opportunity quality.
- The LLM may explain or expand a candidate, but it cannot override strong project data.
- Raw signals from the project or the discovery pipeline must take precedence over LLM-generated estimations.
- Suggested references and topic expansions are useful but should be treated as unverified unless explicitly corroborated by trusted sources.
- The opportunity is not considered ready for generation until it is approved by the user or by the configured approval policy.

### 8.3 Why this matters

A pure LLM approach tends to prioritize plausibility over actual fit. A hybrid approach keeps the system useful by combining:

- deterministic quality signals for fairness and reproducibility,
- LLM assistance for richer content expansion and reasoning,
- explicit human review before creation.

This is the right balance for a content factory that must be both scalable and trustworthy.

## 9. Settings and configuration requirements

The following settings support the behavior described above:

### 9.1 Project-level defaults

- brand_voice: teacher-led storytelling voice
- project audience
- content_types
- language / locale
- difficulty defaults
- approval-first generation mode

### 9.2 UI-level settings

- the generation form should show only the essentials by default
- advanced settings hidden behind an explicit toggle

### 9.3 Quick-start intent extraction requirement

Quick project creation is not a generic keyword parser. It must interpret the user’s actual intent and convert it into a project configuration that is specific to the requested domain, audience, and content style.

Examples:

- "create articles for oauth" must produce a project focused on OAuth, authentication, and identity topics rather than a generic article factory
- "build AI security tutorials for founders" must prefer AI/security-focused educational content and founder-oriented messaging
- short or vague requests must still preserve useful defaults, but they must never overwrite the user’s stated domain with generic defaults

The quick-start inference must prioritize:

1. the strongest topic or subject phrase in the request,
2. the intended audience implied by the domain,
3. the content format that matches the user’s intent,
4. the brand voice and structure that support teacher-led storytelling,
5. explicit user direction over generic fallback values.

This requirement exists so the project configuration reflects the real ask instead of keyword frequency or a generic "10 article" default shape.
- generation action disabled until an approved opportunity is selected

### 8.3 Prompt-level settings

The prompt must explicitly instruct the model to:

- start with scenario and problem
- discuss approach and solving strategy
- present pros and cons
- keep the content engaging for mixed-level audience
- preserve truthfulness and source grounding

---

## 9. Acceptance criteria

The implementation is considered complete when all of the following are true:

1. A user can discover topics and see them in the Discoveries area.
2. A user can approve or reject discovered topics.
3. Only approved topics appear in the generation form.
4. The generation form is disabled until an approved topic is selected.
5. The generation form hides advanced options by default and reveals them when the user explicitly requests them.
6. The prompt requires teacher-storytelling behavior with scenario → problem → approach → solution → pros and cons → takeaway.
7. Generated content is grounded in evidence and does not invent unsupported facts.
8. The user can generate content only from an approved topic, not directly from an arbitrary freeform prompt.

---

## 10. Implementation tasks

### Phase 1: UX and flow enforcement

- keep the Discoveries flow as the source of topic approval
- disable generation unless an approved opportunity is selected
- show precise guidance when no approved opportunities exist
- hide optional settings by default

### Phase 2: Prompt hardening

- enforce scenario-problem-approach-solution structure
- require pros and cons in relevant sections
- maintain teacher-like tone and section rhythm
- preserve source-grounding constraints

### Phase 3: Quality validation

- validate that generated content includes a narrative arc
- ensure trade-offs remain grounded and realistic
- confirm submissions use approved opportunities only

---

## 11. Implementation notes

The current implementation already aligns with the key approval-first requirement:

- the generation page only displays approved opportunities, as shown in [content-factory/frontend/src/pages/Generate.tsx](../frontend/src/pages/Generate.tsx)
- the prompt enforces narrative teaching style in [content-factory/backend/prompts/writer.md](../backend/prompts/writer.md)
- the default generation voice is set during project creation in [content-factory/frontend/src/pages/Projects.tsx](../frontend/src/pages/Projects.tsx)

This pattern should remain the default contract for all future content generation work.
