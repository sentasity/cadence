---
name: c-check
description: Substance review of an existing design or plan. Reads doc(s); reports on accuracy, internal consistency, completeness, hidden assumptions, contradictions, scope creep. Does NOT read code — that's /c-find-bugs. Default: substance only. --format flag adds Cadence compliance checks for hand-imported or hand-edited artifacts. Output never modifies the reviewed doc; report stays in chat.
---

# `/c-check`

You review designs and plans for substance — does this make sense, does it hang together, are there gaps, are there silent assumptions that won't survive contact with reality. You do NOT touch code; that's `/c-find-bugs`'s job.

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
| **Accuracy** | Do the claims in this doc match related artifacts (linked design ↔ plan, existing code referenced in File Map, etc.)? |
| **Internal consistency** | Do sections contradict each other? Do decisions in the overview match what children actually say? |
| **Completeness** | Are there obvious gaps — missing failure modes, undefined terms, untouched concerns (security, observability, perf)? |
| **Hidden assumptions** | What is the doc taking for granted that won't be true? (e.g. "user is logged in" without saying when login happens.) |
| **Scope discipline** | Does the design/plan stay within brainstormed scope, or has it crept? |
| **Internal logic** | Logical errors in proposed flow — race conditions, infinite loops, ordering violations. |
| **Open-questions check (Invariant 1)** | Any callouts that read like open questions ("should we…", "we might…", "TBD")? |

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

- **Critical** — would prevent the design from being implementable or the plan from executing correctly.
- **Important** — gaps or inconsistencies that would surface during build but aren't fatal.
- **Minor** — polish, clarity, redundancy.

## Interactive finding application (optional follow-up)

After the report is printed, ask via `AskUserQuestion` whether to enter apply mode. Default is report-only; apply mode is opt-in. Per [[designs/2026-05-17-cadence/00-overview#Decisions log]] TUI decision.

**Entry question (single AskUserQuestion):**

- *"Enter apply mode to walk findings one at a time?"*
  - **Apply mode (critical only)** *(Recommended when ≥1 critical)* — walk only Critical-severity findings.
  - **Apply mode (all)** — walk Critical + Important + Minor.
  - **No, leave the report as-is** *(Recommended when zero critical)* — exit; user applies fixes manually later.

**Per-finding question** (only in apply mode), for each finding in severity order:

- *"Finding: `<section>:<line>` — `<summary>`. Apply?"*
  - **Apply** — make the fix inline. For substantive findings (where "Fix:" is a direction not a one-liner), surface a follow-up sub-question with concrete options.
  - **Skip** — leave as-is; do nothing.
  - **Mark as decided** — add a clarifying note to the doc explaining the user accepted the current behavior; re-runs won't re-flag it.

## When to run /c-check

- Before user-marks-as-approved on a design.
- Before invoking `/c-plan` (catch design gaps that would corrupt the plan).
- Before invoking `/c-execute` (catch plan gaps that would corrupt the build).
- After a long brainstorming session to verify the design captured what was decided.
- When an imported design/plan needs sanity-checking.

## What `/c-check` doesn't do

- Doesn't read code (that's `/c-find-bugs`).
- Doesn't modify the reviewed doc — only reports.
- Doesn't flip status — that's the user's call after reading the report.
- Doesn't write follow-up artifacts (no review-result file). Report stays in chat.
- Doesn't audit plan implementation (that's `/c-audit`).

## References

- Design source: [[designs/2026-05-17-cadence/07-check]].
- Shared format spec: `skills/_shared/obsidian-format.md`.
- Sister diagnostic: `/c-find-bugs` (concrete defects vs. this skill's "is it good?" framing).
