---
name: c-audit
description: User-facing standalone skill that audits a plan against the codebase. Reads `base_sha:` from the plan's overview frontmatter to compute the diff range. Dispatches `cadence-completion-auditor` agent which fans out per-audit sub-agents in parallel and synthesizes results. /c-execute does NOT route through this skill — it dispatches the same agent directly. Both paths produce identical results because both dispatch the same agent. Standalone mode never modifies the plan or status.
---

# `/c-audit`

You verify a plan was actually implemented. You delegate the heavy lifting to the `cadence-completion-auditor` agent (which orchestrates per-audit sub-agents); your job is pre-flight, invocation, and surfacing the agent's report to the user.

## Architecture: standalone wrapper around the auditor agent

This skill is the **standalone** invocation path. `/c-execute` does NOT route its completion-gate audit through this skill — it dispatches `cadence-completion-auditor` directly. The agent is the single source of truth for audit logic; both invocation paths (this skill, and `/c-execute`'s gating call) dispatch the same agent with the same parameters and produce identical results.

This means: if you ever change audit behavior, change the agent. Changing this skill only affects the standalone UX (pre-flight messages, output formatting).

## Invocation form

`/c-audit <plan-path>` — standalone. Report only; do NOT flip status. There is no "called internally by /c-execute" mode — `/c-execute` doesn't call this skill, it dispatches the agent directly.

## Pre-flight (in order)

1. **Plan folder exists** with `00-overview.md`.
2. **Linked design exists.** Read `linked_design:` from plan's overview frontmatter. Confirm design folder exists with `status: approved` or later.
3. **`base_sha:` is set.** Read from plan's overview frontmatter. If missing:
   - Abort with: *"`base_sha` is not set on this plan's `00-overview.md`. /c-execute should have set it on first invocation. Either re-invoke /c-execute (which records `base_sha`) or manually set `base_sha` to the SHA at which execution started."*
4. **Diff range computable.** `git diff <base_sha>..HEAD` should not error. If it does (e.g. `base_sha` not in current branch's history), surface the git error verbatim.

## SHA-based diff range (NOT timestamp-based)

> [!warning] Why SHA, not timestamp
> An earlier draft of this skill (and similar tools) used "commits since the plan's `created` timestamp." That's brittle: rebases rewrite commit dates, merges interleave commits from other branches, and the timestamp-to-commit mapping isn't 1:1. SHA-based pinning is deterministic.

## Dispatch model

Dispatch the `cadence-completion-auditor` agent (via `Task` tool) with:
- Plan folder path.
- Linked design folder path.
- `.cadence/config.yaml` content (specifically `audits.*` keys).
- Mode: `standalone` (this skill ALWAYS passes `standalone`; the `gating` mode is for `/c-execute`'s direct-dispatch path).
- Diff range (`base_sha`..HEAD).

The agent fans out per-audit sub-agents in parallel and returns a synthesized report. The full audit roster, lethality, and prompt library all live in the agent (see `agents/cadence-completion-auditor.md`).

## Default audit roster

Built-in (ships with Cadence — blocking unless noted):

- **checkbox-completeness** — every `- [ ]` is `- [x]`
- **oos-justification** — every plan-side 99-OOS entry has rationale + wikilink
- **deferred-comment-scan** — no new TODO/FIXME/XXX/// will/// later/# stub in diff unjustified by 99-OOS
- **code-behind-checkbox** — every `- [x]` step claiming to add a function/symbol has that symbol in the diff
- **design-intent-alignment** — sub-agent reads design + diff; verifies implementation honors design intent (not just task literal)
- **build-validator** — runs `audits.build_validator.command` (e.g. `make ci`); zero exit required. **Refuses (blocking error) if `command: null`** — fresh-install default forces explicit configuration.

Warning-only (surfaced but don't block):

- **file-map-honesty** — every File Map entry in diff; nothing outside File Map modified
- **design-plan-consistency** — plan still links design; decisions log reflected in File Map
- **validation-doc-presence** — 96-validation.md (or 98 for vault-shaped) has all three categories

Repo-configurable add-ons (declared in `.cadence/config.yaml` → `audits.optional`):

- `api-drift-detector`, `update-docs`, or any other named audit. Lethality declared per-audit in config.

## Lethality and outcomes

| Status | Effect standalone (this skill) | Effect via /c-execute (direct agent dispatch) |
|---|---|---|
| All pass | Report only; user may flip status manually | `/c-execute` flips status to `implemented` |
| Any blocking failure | Report only; failures highlighted | `/c-execute` keeps status at `in-progress` |
| Only warnings fail | Report only; warnings highlighted | `/c-execute` flips to `implemented` and surfaces warnings |

> Note: the right column describes `/c-execute`'s behavior for completeness — those outcomes are produced by `/c-execute` dispatching the same agent this skill dispatches. The agent is identical; only the caller's reaction differs.

**Three response paths on failure** (consistent with `/c-execute`'s drift handling). Presented via `AskUserQuestion` (TUI multi-choice) with "Fix" marked `(Recommended)` in most cases — per [[designs/2026-05-17-cadence/00-overview#Decisions log]]. Question text and options follow `skills/_shared/ask-user-question.md` — lead with a plain-English summary of *which* audit failed and what's at stake (the user has been waiting through a long execution and may not remember which audit covers what); one `(Recommended)` option with rationale in its description.

- **Fix** *(Recommended)* — re-dispatch the implementer (or relevant sub-agent) with the failing audit's report; re-run `/c-audit`.
- **Mark out of scope** — work moved to plan-side 99-OOS with rationale + wikilink; the blocking item now justified; re-run `/c-audit` (usually passes). Internally an OOS entry; user-facing label is "mark out of scope."
- **Abort** — leave plan at `in-progress`; user resumes later.

## Standalone use cases

- After `/c-execute` completed and flipped to `implemented`, before deploying — double-check.
- Mid-execution sanity check on a partial plan (will be all blocking failures until tasks complete — not useful unless you want to see progress).
- Long after implementation, audit against current main-branch state to catch unrelated regressions.
- User suspects `/c-execute`'s embedded gating call glossed over something — re-running standalone dispatches the same agent and produces a fresh report.

## When NOT to use standalone

- **During an `/c-execute` pause on an audit failure** — the report `/c-execute` shows IS what this skill would produce (same agent, same parameters). Re-running wastes tokens.
- **On a `draft` plan that hasn't been executed** — checkboxes all `[ ]`; report all blocking.

`/c-execute`'s pause surface includes: *"To re-run the audit after fixing, type `/c-audit <plan-path>`."*

## Output format

Returned by `cadence-completion-auditor`; surface unchanged to the caller. Leads with a plain-English paragraph; then Verdict (PASS / BLOCKED / WARNINGS-ONLY); then Blocking failures, Warnings, What's working, Recommended next action.

## What `/c-audit` doesn't do

- Doesn't validate the deployed system (that's `/c-validate`).
- Doesn't review docs for substance (that's `/c-check`).
- Doesn't find code bugs unrelated to the plan (that's `/c-find-bugs`).
- Doesn't write code, modify the plan, or flip status when called standalone.
- Doesn't dispatch implementer fixes — reports; user (or /c-execute) decides on fixes.

## References

- Design source: [[designs/2026-05-17-cadence/05-audit]].
- Companion agent: `cadence-completion-auditor` (Plan 2).
