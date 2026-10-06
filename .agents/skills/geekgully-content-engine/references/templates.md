# GeekGully content templates

Use the template matching `content_type`. Roadmaps, comparisons, certification guides, projects,
and news-analysis pages use the guide template, adapted.

## Guide

```text
# [Clear, Specific Title] [Year only if time-sensitive]

**Quick answer:**
[40–60 word direct answer to the main question.]

**Who this is for:**
[Beginner SOC aspirant / developer / cloud engineer / student.]

**What you will learn:**
- [Outcome 1]
- [Outcome 2]
- [Outcome 3]

## Why this matters
[Real-world problem and why the reader should care.]

## Prerequisites
- [Required knowledge]
- [Tools]
- [Accounts or environments, if any]

## Step-by-step explanation / roadmap
### 1. [Step or concept]
### 2. [Step or concept]

## Practical example
[Real command, code, configuration, scenario, table, or case study.]

## Common mistakes
| Mistake | Why it happens | How to avoid it |
|---|---|---|

## Hands-on practice
[Lab, exercise, project, quiz, or checklist.]

## FAQs
### [Question]?
[Concise answer.]

## Key takeaways
- ...

## Next steps
- [Related GeekGully guide]
- [Related lab]
- [Related career path]
```

## Interview questions

```text
# Top [N] [Role] Interview Questions and Answers [Year]

**Quick answer:**
[What these questions test and how to use this guide.]

## Beginner questions
### 1. [Question]
**Short answer:** [2–4 sentences]
**Detailed answer:** [Explanation, example, practical context]

## Intermediate questions
## Scenario-based questions
### [Scenario]
**How to answer:** [Structured response using a repeatable framework]

## Practical preparation plan
## Download / practice
[Quiz, flashcards, or PDF CTA.]

## Related GeekGully resources
```

## Lab

```text
# [Lab Title]

**Difficulty:** Beginner / Intermediate / Advanced
**Estimated time:** [X minutes]
**Skills practiced:** [Skills]
**Safety and legal use:** [Safe/legal environment statement; authorization requirement]

## Objective
## Environment
[Tools, VM, cloud sandbox, or local setup.]
## Steps
1. ...
## Expected output
## Troubleshooting
| Issue | Fix |
|---|---|
## Cleanup
[How to safely stop/delete resources.]
## Related learning path
```

## Cheat sheet

Quick answer → command/config tables grouped by task → one worked example with real output →
safe-use note (authorization for offensive tools) → links to labs and interview questions using the tool.

## Schema guidance

- Guides/blog: `Article` or `BlogPosting` + `Person` author + `BreadcrumbList`; `FAQPage` only if FAQs are visible.
- Labs/how-tos: `HowTo` only if steps are visible; otherwise `Article`.
- Interview pages: `FAQPage` only for visibly rendered Q&A.
- Salary/data pages: `Article` (+ `Dataset` only if the data is actually published on the page).
- No empty or hidden structured data; schema must match visible content.

## Self-review after GENERATE

After drafting, run the checklist in `qa-review.md` yourself and report: score, any mandatory
failures, claims flagged "Requires human verification", and placeholders (author, reviewer,
sources to confirm). Do not claim reviewer sign-off or invent author details.
