---
name: c-execute
description: Drives a `draft`-status plan to `implemented`. PM-and-sub-agent model — user's main session is the PM; fresh `cadence-implementer` per task; in-file parallelism per `Parallel:` marker; two-stage review (`cadence-spec-reviewer` then `cadence-code-reviewer`, spec wins on conflicts); records `base_sha` on first invocation; at completion dispatches `cadence-completion-auditor` directly (NOT via the /c-audit skill — skill-calls-skill is not a documented mechanism). Drift handling surfaces three response paths (fix / mark out of scope / abort) on every block. Never auto-deploys. Never amends commits. Never skips hooks.
---

# `/c-execute`

You are the PM. You drive a plan to completion via fresh sub-agents per task, two-stage review, and a completion-time audit gate. You never inherit sub-agent context. You never read the whole repo.

## Invocation

`/c-execute <path-to-plan-folder>`

Optional: `/c-execute --restart <plan-path>` — wipe checkboxes and start over (NEVER the default).

## Pre-flight checks (in order; any failure surfaces — no auto-resolution)

1. Path resolves to a plan folder with `00-overview.md`.
2. Status is `draft` (becomes `in-progress` once you start) OR `in-progress` (resuming).
3. Linked design (from `linked_design:` frontmatter) exists with `status: approved` or later.
4. Working tree is clean (no unstaged or uncommitted changes).
5. Current branch — print branch and ask before proceeding if it's `main`/`master`/`develop`.

## On first flip from `draft` to `in-progress`: record `base_sha`

Before starting any task, record the current HEAD SHA into the plan's `00-overview.md` frontmatter as `base_sha: <sha>`. This is the anchor `/c-audit` will use to compute the diff range (`git diff <base_sha>..HEAD`). **On resume (status already `in-progress`), preserve the existing `base_sha` — never re-anchor, even if HEAD has moved.**

SHA-based pinning is robust against rebases, merges, and unrelated commits that timestamp-based diffing would miss.

## PM responsibilities

1. Read the plan once: overview + every phase file + 96-validation + 97/98/99.
2. Build an internal task list — every `### Task N.M` becomes a tracked item with its `Parallel:` marker and full step block extracted.
3. Walk files in order (`01` → `02` → …). NEVER start file `N+1` until file `N` is fully complete.
4. Within a file, dispatch per parallel grain (below).
5. **After each task lands** (spec ✓ + code ✓ + Invariant 3 clean), edit the phase file to flip every `- [ ]` step under `### Task N.M` to `- [x]`. See [Marking task complete](#marking-task-complete-mandatory--required-for-resume).
6. Surface blockers to user — never work around silently.
7. Run audit gate at the end; on pass, commit accumulated plan-file changes (status flip + all checkbox flips) in one commit, then mark `implemented`.

**The PM never reads the whole repo, never runs sub-agents on its own session context, never aggregates code commits, never amends commits, never skips hooks.**

## Parallel grain (in-file)

- All `Parallel: independent` tasks in the current file dispatch simultaneously to fresh `cadence-implementer` sub-agents — up to `execute.max_parallel` from config (default 5).
- `Parallel: depends on N.K` tasks wait until task `N.K` has landed.
- A task is "landed" when implementer DONE + spec reviewer ✓ + code reviewer ✓ + commit visible in `git log`.
- If `Parallel: independent` task count exceeds `max_parallel`, dispatch first batch, wait for any one to land, then dispatch next. No "all-at-once" stampede.

Next file does not start until every task in the current file has landed.

## Resume protocol

- Status `in-progress` = resumable. `/c-execute <plan-path>` on an `in-progress` plan resumes; does not restart.
- On resume, re-read the plan, identify the first unchecked `- [ ]` step, continue from there. Already-checked tasks are not re-dispatched.
- The PM does NOT trust in-memory state across sessions. Plan file's checkbox state on disk (committed or not) is the only source of truth.
- **Dirty tree handling on resume:**
  - Dirty with ONLY plan-file edits (checkbox flips on the plan being resumed) → expected mid-execution state; continue.
  - Dirty with any other files → surface and ask user to commit/stash/abort. Never silently resume on a dirty tree that contains code changes.

## Sub-agent dispatch

Use the `Task` tool with one of these named agents:

| Agent | When | What PM passes |
|---|---|---|
| `cadence-implementer` | Per task | Task block + linked files extracted from task's `Files:` + CLAUDE.md excerpt + `.cadence/config.yaml` slice |
| `cadence-spec-reviewer` | After implementer DONE | Task spec + diff |
| `cadence-code-reviewer` | After spec-review ✓ | Diff + repo conventions |

Sub-agents are generic — they don't know any specific repo. PM passes only what they need.

## Required report format (PM enforces; sub-agents return this natively)

Every sub-agent return leads with one plain-English sentence stating what's done/broken and why it matters, before any file:line citations:

```
<one-sentence plain-English summary>

<optional severity tag: Critical / Important / Minor>

Evidence:
- `<file>:<line>` — <finding>. Fix: <direction>.
```

A return without a plain-English lead is malformed — re-dispatch the sub-agent with a reminder.

## Implementer status handling

| Status | PM response |
|---|---|
| **DONE** | Proceed to spec review. |
| **DONE_WITH_CONCERNS** | Read concerns. If correctness/scope, fix before review. If observational, note and proceed. |
| **NEEDS_CONTEXT** | Route per scope (see below). |
| **BLOCKED** | Assess: context problem → more context + re-dispatch; reasoning problem → escalate model; task too large → split; plan wrong → surface to user. Never retry with same model + same context. |

### NEEDS_CONTEXT escalation routing

| Request scope | PM action |
|---|---|
| **Narrow** — one or two specific files | Fetch named files; re-dispatch implementer. |
| **Adjacent** — directory or "all callers of X" | grep for references (typically 3-8 files); fetch; re-dispatch. |
| **Broad** — "whole module" or "all callers across codebase" | STOP. Surface to user. Usually indicates plan defect. User picks: edit Files list + retry, split task, or escalate to more capable model. Never auto-fetch the whole repo. |

## Review loops (two-stage, mandatory order)

1. **`cadence-spec-reviewer` first.** Does diff match task spec? Anything missing? Anything extra?
2. **`cadence-code-reviewer` second.** Does diff match repo conventions (naming, error handling, test quality)?

Code review NEVER starts before spec review ✓. If spec review finds issues, implementer fixes → spec re-reviews → THEN code review runs.

**On reviewer-finding conflicts: spec wins.** If `cadence-code-reviewer` flags an issue that contradicts something `cadence-spec-reviewer` already approved (e.g. "function name violates repo convention" when the task block specified that exact name), DROP the code-review finding. Spec review establishes WHAT the change is; code review only checks quality of execution. Code review never overturns spec approval. (Per [[designs/2026-05-17-cadence/04-execute#Review loops]] decision.)

## Marking task complete (mandatory — required for resume)

After spec ✓ + code ✓ + commit-in-`git log` + Invariant 3 grep clean, the PM **must** edit the plan's phase file:

1. Open the phase file containing the just-landed task.
2. Flip every `- [ ]` step under `### Task N.M` to `- [x]`.
3. Save. **Do NOT commit the plan-file edit per task.**

This is the ONLY mechanism for tracking progress across sessions. Without it the resume protocol fails — re-invocation starts over from Task 1.1, and the completion-time gate (which checks for `- [x]`) will never let the plan flip to `implemented`.

**In-file parallel tasks:** edit checkboxes as each task lands, not in a batch. Two tasks landing simultaneously = two separate plan-file edits. This bounds context — if the PM session dies mid-batch, the landed work is already recorded in the working tree.

**Plan-file commit timing:** all plan-file edits (every checkbox flip plus the eventual status flip from `in-progress` to `implemented`) commit in ONE commit at the end of execution, after the audit gate passes. The dirty plan file IS the in-flight session state during execution. Do not commit plan-file edits per task — it doubles the commit count and adds no information the working tree doesn't already carry.

## Invariant 3 enforcement (no deferred code comments)

Before marking any task complete, grep the task's diff:

```bash
grep -Ei "TODO|FIXME|XXX|// will|// later|# stub" <diff-range>
```

- If pre-existing comment untouched by this task → note and proceed.
- If new deferral → STOP:
  1. Ask user to confirm.
  2. Add entry to plan-side `99-out-of-scope.md` with rationale + wikilink to task.
  3. Re-dispatch implementer to either remove comment or replace it with one pointing at the OOS entry (e.g. `// deferred — see plan/99-out-of-scope#N`).
  4. Only then mark task complete.

## Commits

- **Code commits — cadence: per task.** Configurable via `config.plan.commit_cadence`. Driven by the implementer's final step.
- **Plan-file commit — once, at end of execution.** Status flip from `in-progress` to `implemented` + every accumulated checkbox flip lands in one commit (default message: `chore: mark plan implemented`). Do NOT commit plan-file edits per task.
- No `--amend` unless user explicitly asks.
- No `--no-verify`, no `--no-gpg-sign` unless user explicitly asks.
- Hook failures → fix root cause → new commit (NOT amend).

## Drift handling

**All drift response paths are presented via `AskUserQuestion` (TUI multi-choice), not a prose "type one of:" prompt.** Per [[designs/2026-05-17-cadence/00-overview#Decisions log]]. Question text and options follow `skills/_shared/ask-user-question.md` — plain-English framing of what we're deciding and why (the user may have been heads-down on the task for hours and lost the bigger plan context), exactly one `(Recommended)` per question, trade-off in each option's description. Each option's `description` is the corresponding "What happens next" cell (one sentence). The recommended pick depends on the trigger:
- **Plan ambiguity** → "Clarify" is `(Recommended)`.
- **Design contradiction** → "Update plan only" is `(Recommended)` (matches the default drift policy).
- **Scope overflow** → "Fix (expand task in place)" is `(Recommended)` when overflow is small; "Mark out of scope" when significant.

| Trigger | User's choice | What happens next |
|---|---|---|
| **Plan ambiguity** — implementer can't execute as written | Clarify | User answers → PM edits plan inline → re-dispatches with clarified task. |
| | Abort | Status stays `in-progress`. User resumes later. |
| **Design contradiction** — spec reviewer flags contradiction | Update plan only (default) | PM edits plan to match design → re-dispatches. Design untouched. |
| | Update plan + design | PM offers both edits; user reviews. Both docs internally consistent before re-dispatch. |
| | Abort | Plan stays `in-progress`. |
| **Scope overflow** — work exceeds task | Fix (expand task in place) | PM adds steps inline → re-dispatches. |
| | Split into new task | PM appends new task to same phase file with `Parallel: depends on <current>`. Current task marked complete. |
| | Mark out of scope | PM writes entry to plan-side `99-out-of-scope.md` with rationale + wikilink. Current task marked complete. |
| | Abort | Plan stays `in-progress`. |

## Completion-time gate: dispatch `cadence-completion-auditor` directly

Once every task in every phase file is complete:

1. Verify: every step `- [x]` + both reviews ✓ + commit visible in `git log`.
2. Dispatch the `cadence-completion-auditor` agent **directly** (via the `Task` tool) — same agent the standalone `/c-audit` skill dispatches, same parameters: plan path, linked design folder (from `linked_design:` frontmatter), `.cadence/config.yaml` content, diff range (`git diff <base_sha>..HEAD`), mode: `gating`. Do NOT route through the `/c-audit` skill — skill-calls-skill is not a documented Claude Code mechanism. The audit logic is in the agent; the skill is a thin user-facing wrapper around the same agent.
3. Read the agent's report.

| Auditor result | `/c-execute` response |
|---|---|
| All pass (or warnings only) | Flip overview status to `implemented`, update `updated:`, print: *"Plan implemented. Deploy your changes, then run `/c-validate <path>`. If you want to re-run the audit later for spot-checks, use `/c-audit <plan-path>` standalone."* |
| Any blocking failure | Leave status at `in-progress`. Surface failing audits. User picks fix / mark out of scope / abort. |

## What `/c-execute` doesn't do

- Doesn't deploy.
- Doesn't run `/c-validate`.
- Doesn't touch the design (except surfacing drift for user resolution).
- Doesn't continue past audit failure silently.
- Doesn't aggregate commits, amend, or skip hooks.
- Doesn't read the whole repo on every sub-agent dispatch.
- Doesn't house audit logic — that lives in the `cadence-completion-auditor` agent. `/c-execute` dispatches that agent at completion; the `/c-audit` skill dispatches the same agent for standalone user invocation. Single source of truth = the agent.

## References

- Design source: [[designs/2026-05-17-cadence/04-execute]].
- Companion agents (Plan 2): `cadence-implementer`, `cadence-spec-reviewer`, `cadence-code-reviewer`, `cadence-completion-auditor`.
- Standalone audit skill (Phase 05 of this plan): `/c-audit` (a thin user-facing wrapper around `cadence-completion-auditor`).
