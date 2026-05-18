---
name: c-find-bugs
description: Concrete defect hunting on a target. Operates on docs OR code. Different lens from /c-check ("is this good?"); this asks "what specific defects exist?" Targets: design folder, plan folder, branch, file, or --repo. Repo scope is token-heavy and requires explicit confirmation before starting. Output is a prioritized list of defects with file:line citations and one-line fix directions.
---

# `/c-find-bugs`

You hunt concrete, fixable defects. Each defect comes with a citation, severity, and a direction for fixing — not a vague "this seems off."

## Invocation forms

| Form | Target | Token cost |
|---|---|---|
| `/c-find-bugs <design-folder>` | Design — logical defects in proposed system | Medium |
| `/c-find-bugs <plan-folder>` | Plan — execution bugs (missing deps, type mismatches, impossible steps) | Medium |
| `/c-find-bugs <branch-name>` | Code changes on a branch vs. baseline | Medium |
| `/c-find-bugs <file-path>` | One file's source | Light |
| `/c-find-bugs --repo` | Whole repo | **Heavy** — confirms before starting |

**Default scope when no target is given:** current branch's diff against `main` (or `config.find_bugs.default_baseline`). If on `main` itself, ask for explicit target.

**Token-cost warning:** `--repo` prints estimated scope (file count, approximate token count) and waits for explicit user confirmation. Other scopes start without confirmation.

## What it checks

**On code targets (branch / file / repo):**

| Category | Examples |
|---|---|
| **Correctness** | Off-by-one, null-deref, wrong comparison operator, swapped arguments. |
| **Logic errors** | Conditions that can never be true, dead code paths, infinite loops, missing return statements. |
| **Resource handling** | Leaked file handles, missing connection close, unclosed transactions. |
| **Concurrency** | Race conditions, missing locks, double-checked locking bugs. |
| **Error handling** | Swallowed exceptions, generic `except` catches, missing error propagation. |
| **Security** | SQL injection, command injection, hardcoded credentials, missing auth checks. |
| **API misuse** | Wrong library calls, deprecated APIs, missing required parameters. |
| **Time / date** | `datetime.utcnow()` (deprecated), naive datetime comparisons, timezone leaks. |

**On doc targets (design / plan):**

| Category | Examples |
|---|---|
| **Logical bugs in proposed flow** | Race conditions described in design, ordering violations, missing failure modes. |
| **Plan execution bugs** | Tasks referencing functions defined nowhere; tests that test the wrong thing; commits before tests pass. |
| **Dependency errors** | Task B `depends on` Task A but marked `Parallel: independent`; phase 2 references files created in phase 4. |
| **Type / signature mismatches** | Task 3 says `clearLayers()`, Task 7 says `clearFullLayers()` — same function, different name. |
| **Impossible steps** | "Run `make foo`" when no `foo` target in Makefile. |

## Dispatch model

1. Read target (or the manifest of files in the target).
2. Estimate token cost. On `--repo`, confirm before proceeding.
3. Fan out sub-agents — one per defect category enabled in config (via `Task`).
4. Each sub-agent reports defects with file:line citations, severity, one-line fix direction.
5. Merge, dedupe, prioritize.

## Severity tiers

- **Critical** — bug will cause incorrect behavior or data loss in production.
- **High** — bug surfaces in common cases or violates a stated invariant.
- **Medium** — bug surfaces in edge cases or less-traveled code paths.
- **Low** — code smell or style issue, but the code works.

## Output: citation-first report

Same shape as `/c-check` and `/c-audit`.

```
# /c-find-bugs: <target>
# Estimated tokens: <N>

<one-paragraph plain-English summary of overall code/doc health,
 written for a non-code-reader>

## Critical
- `<file>:<line>` — <description>. Fix: <direction>.

## High
- `<file>:<line>` — <description>. Fix: <direction>.

## Medium
- ...

## Low
- ...

## What's working
- <one-line note on robust patterns observed>

## Recommended next action
<one specific sentence>
```

**"What's working" mandatory** — same calibration rule as `/c-check`.

## Interactive finding application (optional follow-up)

After the report, ask via `AskUserQuestion` whether to enter fix mode. Default is report-only. Per [[designs/2026-05-17-cadence/00-overview#Decisions log]] TUI decision.

**All questions in this section follow `skills/_shared/ask-user-question.md`** — plain-English framing, exactly one `(Recommended)` option per question, trade-off in each option's description. Per-defect questions must include a rolling progress line (`Defect 14/17 — 8 fixed, 5 skipped so far`) and a plain-English TL;DR of what's wrong and why it matters; the bare `<file>:<line>` cite is not enough context by question 14.

**Entry question (single AskUserQuestion):**

- *"Enter fix mode to walk defects one at a time?"*
  - **Fix mode (critical + high only)** *(Recommended when ≥1 critical or high)* — walk only Critical and High severities.
  - **Fix mode (all)** — walk every severity, including Low.
  - **No, leave the report as-is** *(Recommended when only Low/Medium)* — exit; user handles defects manually later.

**Per-defect question** (only in fix mode), for each defect in severity order. Question text leads with the progress line + plain-English TL;DR; the `<file>:<line>` cite anchors back to the report for users who want detail.

- Options:
  - **Fix now** *(Recommended for code targets at file scope when the fix is unambiguous)* — apply the suggested fix inline. NOT available for `--repo` scope without explicit per-file confirmation (too many implicit edits in one batch).
  - **Track** — print the defect in a format ready to paste into an issue tracker (`gh issue create` template, Linear body, etc.); skill moves on.
  - **Mark as decided** — record that the user accepts this as not-a-bug; future runs against the same target can be told to ignore it.
  - **Skip** — leave as-is; no record.

## Repo-scope discipline

When `--repo`:

- Excludes vendor/generated/build paths via `config.find_bugs.exclude` (defaults: `node_modules`, `dist`, `build`, `__pycache__`, `target`, `.next`, `vendor`).
- Limits to source files only — no `*.lock`, `*.snap`, `*.json` fixtures.
- Print estimated token count before run.
- Wait for explicit user confirmation.
- Optional `--quiet` skips the confirmation prompt (use with care).

## What `/c-find-bugs` doesn't do

- Doesn't write or modify code, plans, or designs.
- Doesn't fix the bugs it finds.
- Doesn't audit plan completion (that's `/c-audit`).
- Doesn't review for substance/quality (that's `/c-check`).
- Doesn't validate deployed behavior (that's `/c-validate`).
- Doesn't deduplicate against an issue tracker or memory — every run is fresh.

## References

- Design source: [[designs/2026-05-17-cadence/08-find-bugs]].
- Shared question/option formatting: `skills/_shared/ask-user-question.md`.
- Sister diagnostic: `/c-check` (substance/quality vs. this skill's concrete-defects framing).
