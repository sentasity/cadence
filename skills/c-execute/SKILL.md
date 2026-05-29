---
name: c-execute
description: Drives a `draft`-status plan to `implemented`. PM-and-sub-agent model — user's main session is the PM; fresh `cadence-implementer` per task; DAG-scheduled parallel lanes per `Depends:` edges with a `Touches:` conflict guard; two-stage review (`cadence-spec-reviewer` then `cadence-code-reviewer`, spec wins on conflicts); records `base_sha` on first invocation; at completion dispatches `cadence-completion-auditor` directly (NOT via the /c-audit skill — skill-calls-skill is not a documented mechanism). Drift handling surfaces three response paths (fix / mark out of scope / abort) on every block. Never auto-deploys. Never amends commits. Never skips hooks.
---

# `/c-execute`

You are the PM. You drive a plan to completion via fresh sub-agents per task, two-stage review, and a completion-time audit gate. You never inherit sub-agent context. You never read the whole repo.

## Invocation

`/c-execute <path-to-plan-folder>`

Optional: `/c-execute --restart <plan-path>` — wipe checkboxes and start over (NEVER the default).

## Plan-format detection

Before scheduling, detect the plan format per-plan:
- **New format** (tasks carry `Touches:`) → run the lane engine below.
- **Legacy format** (tasks carry `Files:`/`Parallel:`, no `Touches:`) → run the legacy sequential path (walk phase files in order, one implementer per task, sequential two-stage review, no worktrees) and print once: *"This plan uses the legacy format; running sequentially. Re-plan with `/c-plan` to enable parallel execution."* A single plan is never run half-parallel, half-sequential.
- **`execute.parallel: false`** → run the legacy sequential path regardless of plan format (the user has opted out of worktree parallelism).

## Pre-flight checks (in order; any failure surfaces — no auto-resolution)

1. Path resolves to a plan folder with `00-overview.md`.
2. Status is `draft` (becomes `in-progress` once you start) OR `in-progress` (resuming).
3. Linked design (from `linked_design:` frontmatter) exists with `status: approved` or later.
4. Working tree is clean (no unstaged or uncommitted changes).
5. Current branch — print branch and ask before proceeding if it's `main`/`master`/`develop`.
6. **Worktree confirmation (new-format plans only; skip if `execute.worktree_confirm: false`).** Before opening the first lane worktree, print the worktree plan and ask once via `AskUserQuestion`:
   *"This plan runs up to `<max_parallel>` parallel lanes in git worktrees under `.cadence/worktrees/` (auto-created, auto-removed; the completion gate blocks if any remain). Proceed?"*
   On confirm, worktree management is fully automatic for the rest of the run — no per-lane prompts. On decline, do not start; suggest the user re-run when ready. Legacy-format plans skip this check (no worktrees).

## On first flip from `draft` to `in-progress`: record `base_sha`

Before starting any task, record the current HEAD SHA into the plan's `00-overview.md` frontmatter as `base_sha: <sha>`. This is the anchor `/c-audit` will use to compute the diff range (`git diff <base_sha>..HEAD`). **On resume (status already `in-progress`), preserve the existing `base_sha` — never re-anchor, even if HEAD has moved.**

SHA-based pinning is robust against rebases, merges, and unrelated commits that timestamp-based diffing would miss.

## PM responsibilities

1. Read the plan once: overview + every phase file + 96-validation + 97/98/99.
2. Build an internal task list — every `### Task N.M` becomes a tracked item with its `Depends:` edges, `Reads:` block, `Touches:` list, and full step block extracted.
3. Build the dependency DAG from each task's `Depends:` edges and form lanes per the scheduling loop in "Lane model and DAG scheduling".
4. Dispatch lanes concurrently up to `execute.max_parallel`, respecting `Touches:` disjointness.
5. **After each task lands** (spec ✓ + code ✓ + Invariant 3 clean), edit the phase file to flip every `- [ ]` step under `### Task N.M` to `- [x]`. See [Marking task complete](#marking-task-complete-mandatory--required-for-resume).
6. Surface blockers to user — never work around silently.
7. Run audit gate at the end; on pass, commit accumulated plan-file changes (status flip + all checkbox flips) in one commit, then mark `implemented`.

**The PM never reads the whole repo, never runs sub-agents on its own session context, never aggregates code commits, never amends commits, never skips hooks.**

## Lane model and DAG scheduling

The PM builds a dependency DAG from each task's `Depends:` edges (cross-file allowed), then runs **lanes** — the ready subset of one phase file's tasks — concurrently in isolated worktrees. The phase file is the lane: the unit of dispatch, the unit of review, and the unit of merge.

- **Lane** = the ready subset of one phase file `F`'s tasks, run by one `cadence-implementer` in one worktree, committing per-task internally. Lane boundaries are author-visible (the `0X-*.md` filename); they are NOT a runtime-derived chain.
- **Lane formation (per phase file):** for every phase file `F` with at least one ready task, compute `eligible(F)` = tasks of `F` whose cross-file `Depends:` are merged AND whose `Touches:` are disjoint from every in-flight lane. If `eligible(F)` is non-empty, dispatch it as one lane. Internal `Depends:` (both endpoints in the same eligible subset) do NOT gate dispatch — the implementer resolves them inside the lane by running predecessors first. The phase file = lane rule supersedes the older greedy-chain-extension rule from `docs/designs/2026-05-21-cadence-parallelism/01-execution-engine.md` §"Lane formation".
- **Ready set:** a task is ready when every **cross-file** `Depends:` predecessor has merged to the working branch. Internal `Depends:` are intra-lane ordering, not ready-set gates. Recompute on every land.
- **Co-schedule guard (hard):** two ready lanes may run concurrently only if `Touches(A) ∩ Touches(B) = ∅`. A `Touches:` overlap **serializes** the later lane (defer until the other lands) — never error, never override. The guard now operates between phase-file lanes; same semantics as before.
- **Cap:** up to `execute.max_parallel` lanes (default 4 = concurrent worktrees). Reviewers run on top, uncapped.
- **Follow-up lanes from the same file:** when only part of a phase file is currently ready (cross-file `Depends:` pending or `Touches:` collision), the PM dispatches the ready subset now and the remainder waits in the ready set. When the remainder clears, it forms a second (or third) lane from the same phase file. One file can become 2–3 lanes over a run; each lane reviews independently against its own cumulative diff.

**Edge cases (load-bearing).** A phase file with a single task = a singleton lane; same as today. A phase file with every task blocked at scheduling time = no lane forms; revisit when the ready set changes. An empty phase file is skipped. An internal-`Depends:` cycle inside one file is a plan defect — surfaced at DAG construction, never silently re-ordered. **Two tasks in `F` that declare overlapping `Touches:` are dispatched in the same lane** — the implementer runs them in `Depends:` order with per-task commits; the `Touches:` overlap inside one lane is not flagged (the guard exists only between distinct lanes).

### Scheduling loop

```
build DAG from Depends edges  (once; rebuild on resume)
while unfinished tasks and not quiescing:
    ready = tasks whose cross-file Depends predecessors all merged
            (internal Depends do not gate; the implementer resolves them in-lane)
    while free lane slots > 0:
        for each phase file F (numeric order: 01- before 02- …) with ≥ 1 task in ready:
            eligible(F) = { T in tasks(F) ∩ ready :
                            Touches(T) ∩ Touches(in-flight lanes) = ∅ }
            if eligible(F) is non-empty
               and Touches(eligible(F)) ∩ Touches(in-flight) = ∅:
                open worktree
                dispatch one implementer with eligible(F) as the lane
                mark eligible(F) in-flight
                break  (one dispatch per slot per inner pass)
            else:
                defer F to next tick  (its ready tasks stay in the ready set)
    await next lane to land
    on land: integrate (merge-on-land), flip the lane's task checkboxes, free slot
    (remainder of F = tasks(F) \ landed \ in-flight \ merged stays in ready set;
     re-enters eligible(F) on a later tick when its blockers clear — this is the
     follow-up-lane mechanism)
```

The DAG must be acyclic; a cycle is a plan defect — surface it, never guess an order. Internal-`Depends:` cycles inside one phase file are caught by the same acyclicity check at DAG construction time and never reach this loop.

## Worktree lifecycle and merge-on-land

Lane isolation and integration follow `skills/_shared/worktree-lifecycle.md`.

- **Open** a worktree per lane at lane start (`git worktree add` from the current working tip).
- **Merge-on-land:** when a lane's implementer returns DONE and both reviewers approve the cumulative lane diff, the PM integrates per `execute.integrate` — default `rebase-ff` (**rebase the lane branch onto the current working tip and fast-forward**; linear history, per-task commits preserved), or `merge-commit` (`--no-ff` per lane) for repos that forbid history rewriting.
- **Per-lane clean-merge check (mandatory):** the rebase must report no conflict, the lane commits must be present, and there must be no conflict residue. A conflict here means a `Touches:` declaration was wrong — STOP and surface; never auto-resolve.
- **Remove** the worktree + lane branch on land. **Preserve** it on block.

## Resume protocol

- Status `in-progress` = resumable. `/c-execute <plan-path>` on an `in-progress` plan resumes; does not restart.
- On resume, rebuild the DAG from `Depends:` edges, run `git worktree prune` and remove any leftover `cadence/lane-*` worktrees and branches (per `skills/_shared/worktree-lifecycle.md`), compute the ready set from unchecked tasks, and continue scheduling.
- **The lane is the resume unit.** A lane whose checkboxes were not all flipped to `- [x]` is considered incomplete and re-runs from scratch; any orphaned worktree work is discarded by the prune step.
- The PM does NOT trust in-memory state across sessions. Plan file's checkbox state on disk (committed or not) is the only source of truth.
- **Dirty tree handling on resume:**
  - Dirty with ONLY plan-file edits (checkbox flips on the plan being resumed) → expected mid-execution state; continue.
  - Dirty with any other files → surface and ask user to commit/stash/abort. Never silently resume on a dirty tree that contains code changes.

## Sub-agent dispatch

Use the `Task` tool with one of these named agents:

| Agent | When | What PM passes |
|---|---|---|
| `cadence-implementer` | Per task | Task block + linked files extracted from task's `Reads:` block + `Touches:` list + CLAUDE.md excerpt + `.cadence/config.yaml` slice |
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

## Review loops (two-stage, run in parallel)

When a lane's implementer returns DONE, dispatch **both** reviewers concurrently against the cumulative lane diff:

1. `cadence-spec-reviewer` — does the diff match the task specs? Anything missing/extra?
2. `cadence-code-reviewer` — does it match repo conventions (naming, errors, tests)?

They run at the same time (no ordering barrier). Resolve the two reports:

- Both approve → lane lands.
- Spec finds gaps → implementer fixes in the same worktree → **both** re-run.
- Code finds issues (spec approved) → implementer fixes → both re-run.
- **Conflict: spec wins.** If a code finding contradicts a spec approval, DROP the code finding. Code review never overturns spec.

## Marking task complete (mandatory — required for resume)

The unit of completion is the **lane**, not the individual task. After a lane lands (spec ✓ + code ✓ + clean-merge ✓ + Invariant 3 grep clean for the full lane diff), the PM **must** edit the plan's phase file:

1. Open the phase file(s) containing the just-landed lane's tasks.
2. Flip every `- [ ]` step under every `### Task N.M` in the lane to `- [x]`. All of the lane's task checkboxes flip together on land.
3. Save. **Do NOT commit the plan-file edit per task or per lane.**

This is the ONLY mechanism for tracking progress across sessions. Without it the resume protocol fails — re-invocation starts over from Task 1.1, and the completion-time gate (which checks for `- [x]`) will never let the plan flip to `implemented`.

**Checkpoint before yielding.** Per `skills/_shared/progress-checkpoint.md`: flip a landed lane's checkboxes to disk the moment it lands, and never carry a landed-but-unmarked lane through a pause. Before surfacing any `AskUserQuestion` (drift, block, clarification), every already-landed lane's `- [x]` must be on disk first. The dirty working file is the durable record; a context loss mid-run rebuilds progress from it alone.

**In-flight parallel lanes:** edit checkboxes as each lane lands, not in a batch. Two lanes landing simultaneously = two separate plan-file edits. This bounds context — if the PM session dies mid-batch, the landed work is already recorded in the working tree.

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

### Quiesce-on-block

When a lane returns BLOCKED, hits unresolvable drift, or surfaces a review gap needing user input, enter **quiesce**: set a no-new-dispatch flag, let all in-flight lanes finish and land normally, flush every landed lane's checkboxes to disk (`skills/_shared/progress-checkpoint.md`), preserve the blocking lane's worktree (its dependents stay unscheduled), then surface the blocker via the drift `AskUserQuestion` from a clean, fully-merged tree. Never halt in-flight lanes mid-work; never keep dispatching new lanes while a decision is pending.

**All drift response paths are presented via `AskUserQuestion` (TUI multi-choice), not a prose "type one of:" prompt.** Per [[designs/2026-05-17-cadence/00-overview#Decisions log]].

> **Hard gate — every `AskUserQuestion`, no exceptions:** (1) the `question` opens with a plain-English lead a newcomer could follow — what's being decided and why it matters now (the user may have been heads-down on the task for hours and lost the bigger plan context); (2) exactly one option is marked `(Recommended)` and listed **first** — triage / "which next?" menus included ("your call" is a non-answer); (3) each option's `description` gives the one-sentence trade-off. Full spec: `skills/_shared/ask-user-question.md`.

Each option's `description` is the corresponding "What happens next" cell (one sentence). The recommended pick depends on the trigger:
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
| | Split into new task | PM appends new task to same phase file with `Depends: [<current>]`. Current task marked complete. |
| | Mark out of scope | PM writes entry to plan-side `99-out-of-scope.md` with rationale + wikilink. Current task marked complete. |
| | Abort | Plan stays `in-progress`. |

## Completion-time gate: dispatch `cadence-completion-auditor` directly

Once every task in every phase file is complete:

1. Verify: every step `- [x]` + both reviews ✓ + commit visible in `git log`.
2. **Worktree-cleanup sweep (pre-dispatch):** run `git worktree list` and confirm no `cadence/lane-*` worktrees remain; run `git branch --list 'cadence/lane-*'` and confirm no lane branches remain. If any do, remove them (`git worktree remove --force <path>` and `git branch -D <branch>`) before dispatching the auditor. A dirty worktree at this stage is a plan-execution defect — surface it to the user if removal fails.
3. Dispatch the `cadence-completion-auditor` agent **directly** (via the `Task` tool) — same agent the standalone `/c-audit` skill dispatches, same parameters: plan path, linked design folder (from `linked_design:` frontmatter), `.cadence/config.yaml` content, diff range (`git diff <base_sha>..HEAD`), mode: `gating`. The default audit roster includes `merge-integrity` (verifies each task's commit landed cleanly and the lane history is linear). Do NOT route through the `/c-audit` skill — skill-calls-skill is not a documented Claude Code mechanism. The audit logic is in the agent; the skill is a thin user-facing wrapper around the same agent.
4. Read the agent's report.

| Auditor result | `/c-execute` response |
|---|---|
| All pass (or warnings only) | Flip overview status to `implemented`, update `updated:`, print: *"Plan implemented. Deploy your changes, then run `/c-validate <path>`. If you want to re-run the audit later for spot-checks, use `/c-audit <plan-path>` standalone."* Then, per `skills/_shared/browser-validation.md`, append one informational line **only if** the just-implemented plan's `96-validation.md` has at least one Category B item with an `e2e:` reference AND no runner is configured or detected (`validate.browser_command` at default `npx playwright test` and `auto` detection finds no suite): recommend installing/configuring a runner (Playwright by default), else those steps fall back to manual. Once per run; a repo with a runner configured/detected prints nothing. |
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
