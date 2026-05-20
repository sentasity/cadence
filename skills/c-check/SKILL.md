---
name: c-check
description: Substance review of an existing design or plan. Reads doc(s); reports on accuracy, internal consistency, completeness, hidden assumptions, contradictions, scope creep. Does NOT review code quality (that's /c-find-bugs) but narrowly verifies plan-cited paths/symbols/imports exist in the codebase. Default: substance only. --format flag adds Cadence compliance checks for hand-imported or hand-edited artifacts. Output never modifies the reviewed doc; report stays in chat.
---

# `/c-check`

You review designs and plans for substance — does this make sense, does it hang together, are there gaps, are there silent assumptions that won't survive contact with reality. You do NOT review code quality (that's `/c-find-bugs`). One exception: when the target is a plan, you narrowly read code to verify cited paths/symbols/imports exist — enforcing `/c-plan`'s "Codebase verification" rule from the outside.

## Invocation forms

- `/c-check <design-folder-path>` — review full design.
- `/c-check <plan-folder-path>` — review full plan.
- `/c-check <single-doc-path>` — review one child doc in isolation.
- `/c-check --format <path>` — also run Cadence format compliance.
- `/c-check --any <path>` — accept paths outside Cadence's expected folder structure (e.g. imported designs from elsewhere).

## Entry contract

**Refuses when:** path doesn't exist; OR path is in a Cadence-managed location (under `paths.designs` or `paths.plans` from `.cadence/config.yaml`) but lacks the expected structure (no overview, missing frontmatter) — unless `--any` is set.

## Default mode: substance checks

Each check runs as its own sub-agent in parallel (via `Task` tool). Each receives the target doc(s) + the check's specific prompt.

| Check | What it asks |
|---|---|
| **Accuracy** | Do the claims in this doc match related artifacts (linked design ↔ plan, internal cross-references)? |
| **Internal consistency** | Do sections contradict each other? Do decisions in the overview match what children actually say? |
| **Completeness** | Are there obvious gaps — missing failure modes, undefined terms, untouched concerns (security, observability, perf)? |
| **Hidden assumptions** | What is the doc taking for granted that won't be true? (e.g. "user is logged in" without saying when login happens.) |
| **Scope discipline** | Does the design/plan stay within brainstormed scope, or has it crept? |
| **Internal logic** | Logical errors in proposed flow — race conditions, infinite loops, ordering violations. |
| **Open-questions check (Invariant 1)** | Any callouts that read like open questions ("should we…", "we might…", "TBD")? |
| **Codebase verification** *(plans only)* | Do the file paths, line ranges, symbols, and imports cited in the plan exist in the current code? Per `/c-plan`'s "Codebase verification" rule: `ls`/Read every `Modify` and `Test` path; Read cited line ranges; grep every symbol and import path; check codebase conventions match. Citation that doesn't resolve = **Critical** (plan unexecutable as written). Range drift that still points at the right function = **Important**. Convention mismatch (`_lambda` vs `lambda_`, etc.) = **Important**. Skipped for designs. |

## `--format` mode (Cadence compliance)

Adds these additional checks (each as its own sub-agent):

- Frontmatter completeness (required fields per `frontmatter.required` in config).
- Folder layout matches design or plan conventions (right files present, right naming, reserved slots correct).
- Callout vocabulary stays within the approved set (see `skills/_shared/obsidian-format.md`).
- Plain-English callouts present at every H2 in technical child docs.
- OOS entries have rationale + wikilink per config.
- All wikilinks resolve.

These duplicate what `/c-design` and `/c-plan` already run in their self-review passes. `--format` is for artifacts coming from outside Cadence or hand-edited after a status flip.

## Dispatch model

1. Read target doc(s) + `.cadence/config.yaml`.
2. For each enabled check, dispatch a fresh sub-agent (via `Task`) with the doc(s) + the check's specific prompt + the expected output shape.
3. Sub-agents return findings with citations (file:line, section anchor).
4. Synthesize findings into a report with one section per check.

**Advisor opt-in:** like `/c-brainstorm`, can offer to consult configured advisor agents when checks raise architectural concerns. Off by default.

## Output: citation-first report

Same shape as `/c-find-bugs` and `/c-audit` (consistency is load-bearing).

```
# /c-check: <design or plan path>
# Mode: substance | substance+format

<one-paragraph plain-English summary of whether this doc is ready for the
 next phase (design → approved, plan → execute), written for a non-code-reader>

## Critical (must fix before approval)
- `<section>:<line>` — <plain-English finding>. Fix: <direction>.

## Important (should fix)
- `<section>:<line>` — <plain-English finding>. Fix: <direction>.

## Minor (consider)
- `<section>:<line>` — <plain-English finding>. Fix: <direction>.

## What's working
- `<section>` — <one-line note on what's done well>

## Recommended next action
<one specific sentence: "Ready to flip to in-review" / "Fix the N critical items, then re-review" / etc.>
```

**"What's working" is mandatory** (calibration). A review that only criticizes is uncalibrated.

**"Recommended next action" is mandatory** — one specific sentence, no hedging.

## Severity tiers

Apply conservatively. **Default to Important when uncertain** — `Critical` is reserved for things that block the next phase outright. Sub-agent prompts dispatched by this skill must include this calibration verbatim so individual lenses don't drift upward.

- **Critical** — the doc **cannot move forward** as written; the user has to stop and resolve before approval or execution. Examples: a required decision is missing entirely (not "two docs disagree" — that's Important); a plan's `Files:` list contradicts the change description; a plan task is impossible to execute as specified; a contradiction inside the same doc with no obvious resolution.
- **Important** — gaps or inconsistencies the build will hit, but the work isn't blocked. A developer can pick one interpretation, note the choice, and move on. Cross-doc inconsistencies, undefined-but-recoverable terms, missing failure modes for non-critical paths, hidden assumptions that need surfacing.
- **Minor** — polish, clarity, redundancy. The build won't notice; future readers might.

**Sub-agent heuristic:** if a thoughtful developer could finish the task by picking one interpretation and noting the choice in the PR, it's **Important**. If they'd have to stop and ask the user, it's **Critical**. When in doubt between two tiers, pick the lower one.

## Interactive finding application (optional follow-up)

After the report is printed, ask via `AskUserQuestion` how to handle findings. Default is report-only; any application path is opt-in. Per [[designs/2026-05-17-cadence/00-overview#Decisions log]] TUI decision.

> **Hard gate — every `AskUserQuestion`, no exceptions:** (1) the `question` opens with a plain-English lead a newcomer could follow — what's being decided and why it matters now; (2) exactly one option is marked `(Recommended)` and listed **first** — triage / "which next?" menus included ("your call" is a non-answer); (3) each option's `description` gives the one-sentence trade-off. Full spec: `skills/_shared/ask-user-question.md`.

This is load-bearing when there are many findings: by question 14/17 the user no longer has the report in view, so the question text is their only context.

**Entry question (single AskUserQuestion):**

- *"How should we handle the findings?"*
  - **Walk one at a time** *(Recommended when ≥1 critical)* — Apply/Skip/Mark-as-decided per finding; you see each one.
  - **Walk Critical, auto-apply Important + Minor** — eyes on the blocking items, batch the rest. Auto-applied findings use the report's Fix direction (and the `(Recommended)` option when the fix is a direction-style choice).
  - **Auto-apply everything** — fix all findings per the report's Fix direction without per-finding prompts. Best for small reports where directions look unambiguous.
  - **No, leave the report as-is** *(Recommended when zero critical)* — exit; user applies fixes manually later.

### Auto-apply semantics

When a tier is being auto-applied (no per-finding prompt):

- If the report's Fix is a **one-liner**, apply it directly.
- If the report's Fix is a **direction** (would normally surface Question 2 with 2–4 concrete options), pick the `(Recommended)` option silently and apply it.
- Print a one-line audit summary per auto-applied finding (`Auto-applied: <section>:<line> — <what was changed>`) so the user can scan the batch and revert anything that looks wrong.
- After the batch, print a one-line rollup: `Auto-applied N findings (M one-liner, K direction-with-recommended). Walked X findings.` so the user knows what to spot-check.

### Per-finding question structure (walk mode)

For each finding in severity order, ask two questions back-to-back (skipping question 2 when the fix is one-liner-obvious).

**Question 1 — Apply / Skip / Mark as decided.**

Question text must include, in this order:
1. **Progress line:** `Finding 14/17 — 8 applied, 5 skipped so far` (rolling counters across the walk).
2. **Plain-English TL;DR (one sentence):** what's wrong and why it matters, in language that doesn't require re-reading the report.
3. **Cite:** `<section>:<line>` — the bare finding text, last (anchors back to the report for users who want detail).

Options:
- **Apply** *(Recommended when severity is Critical, or the fix direction is unambiguous)* — make the fix; if Fix is a direction not a one-liner, surface Question 2.
- **Skip** *(Recommended when severity is Minor and the gap is debatable)* — leave as-is; do nothing.
- **Mark as decided** — add a clarifying note to the doc explaining the user accepted the current behavior; re-runs won't re-flag it.

**Question 2 — concrete option pick** (only when applying a substantive finding).

When the report's Fix is a direction (not a one-liner), surface 2–4 concrete options. Question text must include:
1. **Plain-English framing:** what we're deciding and the central trade-off (one sentence each). Not just the finding's title.
2. **Options:** each with a one-sentence trade-off description; mark exactly one `(Recommended)` — usually the report's preferred direction or the lowest-cost option that resolves the finding.

A bare option list like "A. Schema-version stamp / B. Re-stamp at runtime / C. Document drift" is not acceptable — see the worked example in `skills/_shared/ask-user-question.md`.

## When to run /c-check

- Before user-marks-as-approved on a design.
- Before invoking `/c-plan` (catch design gaps that would corrupt the plan).
- Before invoking `/c-execute` (catch plan gaps that would corrupt the build).
- After a long brainstorming session to verify the design captured what was decided.
- When an imported design/plan needs sanity-checking.

## What `/c-check` doesn't do

- Doesn't review code quality (that's `/c-find-bugs`). Narrowly reads code in plan mode to verify cited paths/symbols/imports exist — that's it.
- Doesn't modify the reviewed doc — only reports.
- Doesn't flip status — that's the user's call after reading the report.
- Doesn't write follow-up artifacts (no review-result file). Report stays in chat.
- Doesn't audit plan implementation (that's `/c-audit`).

## References

- Design source: [[designs/2026-05-17-cadence/07-check]].
- Shared format spec: `skills/_shared/obsidian-format.md`.
- Shared question/option formatting: `skills/_shared/ask-user-question.md`.
- Sister diagnostic: `/c-find-bugs` (concrete defects vs. this skill's "is it good?" framing).
