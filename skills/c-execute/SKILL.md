---
name: c-execute
description: Use when the user wants to implement a Cadence plan, or resume one that is already in progress.
---

# `/c-execute`

You are the PM. You drive a plan to completion via fresh implementer sub-agents per lane, one reviewer per lane, and a completion-time audit gate. You never inherit sub-agent context. You never read the whole repo. You don't stop the run for drift: you rule, record the ruling, and keep going (see Rulings and stops).

## Invocation

`/c-execute <path-to-plan-folder>`

Optional: `/c-execute --restart <plan-path>` — wipe checkboxes and start over (NEVER the default).

## Plan-format detection

Before scheduling, detect the plan format per-plan:
- **New format** (tasks carry `Touches:`) → run the lane engine below, or the inline path when the execution-mode gate selects `inline`.
- **Legacy format** (tasks carry `Files:`/`Parallel:`, no `Touches:`) → run the legacy sequential path (walk phase files in order, one implementer and one reviewer per task, no worktrees) and print once: *"This plan uses the legacy format; running sequentially. Re-plan with `/c-plan` to enable parallel execution."* A single plan is never run half-parallel, half-sequential.
- **`execute.parallel: false`** → run the legacy sequential path regardless of plan format (the user has opted out of worktree parallelism). Takes precedence over `execute.mode`; the execution-mode gate is skipped.

## Pre-flight checks (in order; any failure surfaces — no auto-resolution)

1. Resolve config by running `node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-config.js"` and use its JSON `config` for every `execute.*` and `worktree.*` read this run; follow the notice/gitignore/hard-stop contract in `skills/_shared/config-resolution.md`; never read config files directly.
2. Path resolves to a plan folder with `00-overview.md`.
3. Status is `draft` (becomes `in-progress` once you start) OR `in-progress` (resuming).
4. The plan's basis exists: a linked design at `status: approved` or later, resolved and read via `skills/_shared/storage-resolution.md` (read_artifact) rather than a raw `linked_design:` line; or, for a plan written with `/c-plan --from`, every file on the overview's `**Source:**` line. Below, "the design" means whichever the plan has.
5. Plan style is valid: the plan overview's `**Plan style:**` line is absent (meaning `full-code`) or reads `full-code` or `decisions`. Any other value is a malformed plan: stop and surface it here, before the execution-mode gate and before any status or `base_sha` write.
6. Working tree is clean (no unstaged or uncommitted changes).
7. Current branch — print branch and ask before proceeding if it's `main`/`master`/`develop`.
8. **Execution-mode gate (new-format plans only).** Resolve `execute.mode`:
   - **`parallel`** — run the lane engine. Unless `execute.worktree_confirm: false`, ask once via `AskUserQuestion`: *"This plan runs up to `<max_parallel>` parallel lanes in git worktrees under `.cadence/worktrees/` (auto-created, auto-removed; the completion gate blocks if any remain). Proceed?"* On confirm, worktree management is automatic for the rest of the run. On decline, do not start.
   - **`inline`** — run the Inline mode path (below). No worktree question.
   - **`ask`** (default) — ask once via `AskUserQuestion` (this subsumes the worktree confirmation):
     - **Parallel lanes in worktrees `(Recommended)`** — up to `<max_parallel>` lanes under `.cadence/worktrees/` (auto-created, auto-removed), `Touches:` guard, one reviewer sub-agent per lane.
     - **Inline sequential** — the PM session implements every task itself in the main worktree, in dependency order; no worktrees, no implementer sub-agents; the PM reviews inline (reduced independence), and the completion audit still runs as a real sub-agent.
     - **Don't start** — nothing is dispatched; re-run `/c-execute` when ready.
   Legacy-format plans skip this gate entirely.

## On first flip from `draft` to `in-progress`: record `base_sha`

Before starting any task, record the current HEAD SHA on the plan overview as `base_sha` per `skills/_shared/storage-resolution.md` (set_property). `/c-audit` diffs from it (`git diff <base_sha>..HEAD`). **On resume, read the existing `base_sha` and preserve it — never re-anchor, even if HEAD has moved.**

## PM responsibilities

1. Read the plan once via `skills/_shared/storage-resolution.md` (read_artifact): one pass materializes the overview, every phase doc, 96-validation, and 97/98/99 into the in-memory task list. Only the PM reads the plan. From the overview take, once: the **plan style** (no line means `full-code`), the `## Global Constraints` section, and the `## Review Focus` section (both absent on older plans; then pass nothing). Never read `plan.style` from config during execution.
2. Build the task list: every `### Task N.M` with its `Depends:`, `Reads:`, `Touches:`, and step block, and its word count (the task block's text).
3. Build the dependency DAG and form lanes per "Lanes and scheduling".
4. Dispatch lanes up to `execute.max_parallel` running implementers, respecting the `Touches:` guard.
5. **After each lane lands** (review ✓ + Invariant 3 clean), tick its tasks. See [Marking task complete](#marking-task-complete-mandatory--required-for-resume).
6. Rule on drift and keep going; record every ruling (see Rulings and stops). Never work around a blocker silently.
7. Run the audit gate at the end, then the end-of-run question over the Review decisions table; set status to `implemented` per `skills/_shared/storage-resolution.md` (set_status) only when the audit passes and no row is `pending`. Committing the accumulated plan-file changes in one commit is the filesystem backend's mechanism only; in Notion mode every tick and status write already landed live.

**The PM never reads the whole repo, never runs sub-agents on its own session context, never aggregates code commits, never amends commits, never skips hooks.** The PM is the sole caller of `skills/_shared/storage-resolution.md`: the one `read_artifact` and every `tick`/`set_status`/`set_property` write. Implementers and reviewers get their tasks as plain text and touch git only.

## Lanes and scheduling

Applies in `parallel` mode; `inline` mode replaces this engine (see Inline mode). A **lane** is a bundle of ready tasks run by one `cadence-implementer` in one worktree, committed per task, reviewed once, and landed once.

- **Ready:** a task is ready when every `Depends:` predecessor has landed on the working branch, or sits earlier in the same lane. Recompute on every land.
- **Lane formation (word budget):** walk ready, unscheduled tasks in plan order (phase files in numeric order, tasks in order) and add each to the forming lane while the lane's total task text stays within `execute.bundle_words`. A task larger than the budget forms a lane alone. A lane may span phase files. Skip a task (it waits for a later lane) when its `Touches:` overlaps an unlanded lane's or it depends on an unlanded task outside this lane.
- **Touches guard (hard):** two unlanded lanes never share a `Touches:` file. Overlap serializes the later work; never error, never override. Tasks inside one lane may overlap; the implementer runs them in `Depends:` order.
- **Pipelining:** `execute.max_parallel` caps running implementers, not worktrees. A lane frees its implementer slot the moment the implementer returns DONE and keeps its worktree through review; the next lane starts while that review runs, as long as it depends on no unlanded task and passes the guard. A fix round takes the next free slot ahead of a new lane. Reviewers are uncapped.
- **DAG soundness:** the DAG must be acyclic. A cycle is a plan defect: surface it before dispatch, never guess an order.

```
build DAG; mark tasks committed per lane branch (resume)
while unfinished tasks:
    while a free implementer slot exists:
        if a lane awaits a fix round: dispatch its fix
        else: form the next lane by word budget; if empty, break
              open its worktree; dispatch the implementer
    await the next event
    implementer DONE → free slot; dispatch the reviewer
    review approved  → merge-on-land, tick the lane's tasks, remove the worktree
    findings remain  → queue a fix round, or hold the lane at the cap
    BLOCKED / NEEDS_CONTEXT → per the status tables
```

## Inline mode (no worktrees, no implementer sub-agents)

Selected by `execute.mode: inline` or the `ask` gate. The PM implements every task itself in the main worktree.

- **Order:** topological over `Depends:` (same DAG and cycle check), phase files in numeric order and task order as the tie-break.
- **Per task:** follow the steps exactly (TDD shape included), commit per task with the task's commit step plus the `Cadence-Task: N.M` trailer, run the Invariant 3 grep, and tick the task the moment it lands.
- **Review:** before ticking, the PM gives both verdicts of `agents/cadence-reviewer.md` on the task's diff (spec first: exact match for full-code plans, the decisions for decision plans; then quality), with the Global Constraints and the task's Review Focus pins. It records `Tests:` evidence, and follows the implementer's root-cause-first rule when a run misses its Expected line. The author is the reviewer; that is the trade-off the user chose, so do not dispatch reviewer sub-agents anyway. A clear check-9 violation is fixed before ticking; a case the reviewer would decline becomes a `pending` Review decisions row with source `inline self-review`.
- **No worktree machinery:** no lane branches, no merge-on-land, no merge lock. The completion sweep still runs and finds nothing.
- **Drift and blockers:** Rulings and stops apply unchanged; a held task holds its dependents, and everything else continues.
- **Completion gate:** unchanged. The auditor stays a real sub-agent; never run the audit inline.

## Worktree lifecycle and merge-on-land

Lane isolation and integration follow `skills/_shared/worktree-lifecycle.md`.

- **Open** a worktree per lane at lane start (`git worktree add` from the current working tip).
- **Merge lock (gated by `worktree.merge_lock`, default true):** before integrating, run `bash ${CLAUDE_PLUGIN_ROOT}/scripts/merge-lock.sh acquire --target <working-branch> --threshold <worktree.lock_stale_threshold>` from the repo root. The lock is repo-global, so a concurrent `/c-worktree` or hand merge in another session serializes with lane landings. With `worktree.merge_lock: false`, skip acquire/release.
  - `ACQUIRED` (exit 0): integrate, run the clean-merge check, then `bash ${CLAUDE_PLUGIN_ROOT}/scripts/merge-lock.sh release`. Release before anything else waits on the user.
  - `WAITING holder=<branch> age=<s>` (exit 3): keep polling by re-invoking `acquire`. No prompt.
  - `STALE holder=<branch> age=<s>` (exit 2): a stop (see Rulings and stops). Put the holder branch, worktree path, and age from `holder.json` in `<git-common-dir>/worktree-merge.lock/` in the question; the holder may be a live merge in another session. Never auto-steal.
- **Merge-on-land:** when a lane's reviewer approves both verdicts, integrate per `worktree.integrate` (for one release, fall back to the legacy `execute.integrate` when the new key is absent): default `rebase-ff` (rebase the lane branch onto the working tip and fast-forward; per-task commits preserved), or `merge-commit` (`--no-ff` per lane).
- **Clean-merge check (mandatory):** no conflict, the lane's commits present, no conflict residue. A conflict means a `Touches:` declaration was wrong: release the lock and hold the lane; never auto-resolve.
- **Remove** the worktree and lane branch on land. **Preserve** them on hold.

## Resume protocol

- Status `in-progress` = resumable; `/c-execute <plan-path>` resumes, never restarts.
- **All tasks ticked:** go straight to the completion gate, so `pending` Review decisions rows left by **Stop here** or a lost session are picked up.
- **Checkboxes are the truth for landed work.** Read them via read_artifact, cross-check unticked tasks against the working branch's `Cadence-Task:` trailers, and re-tick any whose commits already landed.
- **A lane resumes at its last committed task.** Run `git worktree prune`, then for each leftover `cadence/lane-*` branch read the task ids its commits carry (`git log --format='%(trailers:key=Cadence-Task,valueonly)' <working-branch>..<lane-branch>`). A branch with no task commits is removed. Otherwise re-open a worktree on it: if every task of the lane is committed, dispatch its reviewer; if not, dispatch the implementer with only the uncommitted tasks. The same rule applies mid-run when an implementer returns BLOCKED or NEEDS_CONTEXT with some tasks committed. Prune scoping per `skills/_shared/worktree-lifecycle.md`: never touch a worktree or branch outside `cadence/lane-*`.
- **Dirty tree on resume:** only plan-file edits (this plan's checkbox flips and Review decisions rows) → expected; continue. Any other file → ask the user to commit, stash, or abort. Never resume over uncommitted code.

## Sub-agent dispatch

Use the `Task` tool with one of these named agents:

| Agent | When | What PM passes |
|---|---|---|
| `cadence-implementer` | Per lane, and per fix round | The lane's task blocks (only the uncommitted ones on a resume) + the files their `Reads:` blocks name + CLAUDE.md excerpt + resolved-config slice (see `skills/_shared/config-resolution.md`) + plan style + Global Constraints; on a fix round, the reviewer's open findings |
| `cadence-reviewer` | After implementer DONE, and after each fix round | The lane's task blocks and `Touches:` + worktree path + review range + plan style + Global Constraints + the lane's Review Focus pins + the implementer's `Tests:` evidence + CLAUDE.md excerpt + `execute.review_fix_lines`; on a re-review, its previous findings |

Sub-agents are generic: they don't know any specific repo. Pass only what they need.

## Required report format (PM enforces)

Every sub-agent return leads with one plain-English sentence on what's done or broken and why it matters, before any `file:line` citation. A return without it is malformed: re-dispatch with a reminder. Implementer returns that ran a step command carry a `Tests:` block quoting the real output of each run step (malformed without it, the same way); pass it to the reviewer, which checks it against each Expected line instead of re-running the suite. Reviewer returns carry a `Spec:` and a `Quality:` verdict line and may end with `Fixed:` and `Declined to judge:` sections (`agents/cadence-reviewer.md`); collect Declined items for the Review decisions table.

## Implementer status handling

| Status | PM response |
|---|---|
| **DONE** | Free the slot; dispatch the reviewer. |
| **DONE_WITH_CONCERNS** | Read the concerns. Correctness or scope → fix before review. Observational → note and proceed. |
| **NEEDS_CONTEXT** | Route per scope (below). Committed tasks stay; re-dispatch with the rest. |
| **BLOCKED** | Context problem → more context and re-dispatch; reasoning problem → a more capable model; task too large → split it (a ruling); plan ambiguity → rule (see Rulings and stops). Never retry with the same model and the same context. Nothing left to try → hold the lane. |

| Request scope | PM action |
|---|---|
| **Narrow** — one or two named files | Fetch them; re-dispatch. |
| **Adjacent** — a directory or "all callers of X" | Grep for references (typically 3-8 files); fetch; re-dispatch. |
| **Broad** — a whole module, or callers across the codebase | Hold the lane (usually a plan defect: the task should have listed its files). Never auto-fetch the whole repo. |

## Review loop (one reviewer, two verdicts)

When a lane's implementer returns DONE, dispatch one `cadence-reviewer` on the whole lane range. It gives the Spec verdict first, then Quality, and fixes Minor findings itself when they fit `execute.review_fix_lines` and the lane's `Touches:` (its `fix(review)` commits are part of the lane).

- **Both verdicts Approve** → the lane lands.
- **Findings remain** → a fix round: dispatch the implementer with the open findings in the same worktree, then re-dispatch the reviewer on only the fix range (`<last-reviewed-sha>..HEAD`) with its previous findings. It never re-reads the rest of the lane.
- **Cap:** at most `execute.fix_rounds` implementer fix rounds per lane. Findings still open after the last round hold the lane.
- **Spec decides the run.** What a task or Global Constraint prescribes is never a finding and never a Review decisions row.
- **Declined items** become `pending` rows when the lane lands. They never block a lane and never start a fix round.

## Marking task complete (mandatory — required for resume)

After a lane lands (review ✓ + clean merge ✓ + Invariant 3 clean for the lane diff), tick every `- [ ]` step of each of its tasks per `skills/_shared/storage-resolution.md` (tick), the moment it lands, one lane at a time. On the filesystem backend a tick rewrites `- [ ]` to `- [x]` in the phase file and stays uncommitted; on the notion backend it checks the to-do block live. This is how progress survives a lost session, and the completion gate requires every `- [x]`.

**Checkpoint before yielding** (`skills/_shared/progress-checkpoint.md`): never carry a landed-but-unticked lane or an unwritten Review decisions row through a question or a pause.

**Plan-file commit timing:** every checkbox flip, Review decisions row, and the final status flip commit in ONE commit after the audit gate passes (filesystem backend only). Don't commit plan-file edits per task or per lane.

## Invariant 3 enforcement (no deferred code comments)

Before a lane lands, grep its diff for new deferral comments:

```bash
grep -Ei "TODO|FIXME|XXX|// will|// later|# stub" <diff-range>
```

A pre-existing comment the lane didn't touch is fine. A new one is not: re-dispatch the implementer to remove it. When the deferral is real, rule it out of scope instead: write a plan-side `99-out-of-scope.md` entry (rationale plus a wikilink to the task), have the comment point at it (`// deferred — see plan/99-out-of-scope#N`), and record the ruling.

## Commits

- **Code commits — cadence: per task** (`config.plan.commit_cadence`), each carrying a `Cadence-Task: N.M` trailer so resume can map commits to tasks. Reviewer and fix-round commits are `fix(review): …`.
- **Plan-file commit — filesystem backend only, once at the end** (default message `chore: mark plan implemented`). On the notion backend every write already landed live, so there is no plan file to commit.
- No `--amend`, `--no-verify`, or `--no-gpg-sign` unless the user explicitly asks. A failing hook: fix the cause, make a new commit.

## Rulings and stops

**Drift never stops the run.** Make the ruling below, apply it, record it as a Review decisions row with source `ruling` (what triggered it, what you decided, which task), and keep going. The user sees every ruling in the end-of-run question and can reverse it there.

| Trigger | Ruling |
|---|---|
| **Plan ambiguity** — the implementer can't execute a task as written | Pick the reading that best fits the design (or the plan's source) and the Global Constraints, edit the task in the plan, re-dispatch. |
| **Design contradiction** — the reviewer finds the plan contradicts the design | Edit the plan to match the design; the design is untouched. Re-dispatch. |
| **Scope overflow** — the work outgrows its task | Small: expand the task in place. Real extra work: write a plan-side `99-out-of-scope` entry and finish the task as planned. |
| **Task too large** | Split it: append the new task to the same phase file with `Depends: [<current>]`. |
| **New deferral comment** | See Invariant 3. |

**Holding a lane.** When nothing more can be tried (fix-round cap reached, BLOCKED with every route exhausted, a broad context request, a merge conflict on land), hold the lane: preserve its worktree, leave its tasks unticked, and keep its dependents unscheduled. Every other lane keeps running. A held lane is listed in the end-of-run question.

**Stop only for these.** Pause new dispatch, let in-flight lanes finish and land, flush every tick and row to disk, then ask via `AskUserQuestion` before:
- a **destructive** action: deleting or overwriting data or files beyond a task's own changes, force operations, rewriting shared history, a migration that drops data;
- a **security-sensitive** action: credentials, secrets, permissions, auth, or exposing data;
- an action **outside the worktree**: another repo, system or global configuration, a deploy or other external service, or stealing a stale merge lock (**Wait** `(Recommended)`, **Steal** via `${CLAUDE_PLUGIN_ROOT}/scripts/merge-lock.sh steal --target <working-branch>` only once the holder is verified dead, **Abort**).

> **Hard gate — every `AskUserQuestion`, no exceptions:** (1) the `question` opens with a plain-English lead a newcomer could follow — what's being decided and why it matters now (the user may have been away for hours); (2) exactly one option is marked `(Recommended)` and listed **first**; (3) each option's `description` gives the one-sentence trade-off. Full spec: `skills/_shared/ask-user-question.md`.

## Review decisions (the end-of-run list)

Everything the user decides, in one place: rulings, held lanes, reviewer `Declined to judge:` entries, inline self-review's declined cases, and the completion audit's For your decision items. Lane findings are not rows (the lane loop fixes them), nor is a Critical branch-review finding (it fails the audit), nor anything the plan prescribes.

**The table.** The plan overview carries a `## Review decisions` section, created when the first row arrives:

| ID | Source | Where | Item | Recommended | Decision |
|---|---|---|---|---|---|
| R1 | reviewer | Task 1.3, `app/auth.py:42` | An API key sent with trailing whitespace is rejected as unknown. Unclear whether keys should be trimmed. | accept | pending |

IDs run R1, R2, … in arrival order and never change. Source is `ruling`, `held lane`, `reviewer`, `inline self-review`, `branch review (Important)`, `branch review (Minor)`, or `branch review (Declined)`. Recommended is `accept` (a defensible judgment call, and every ruling), `fix` (wrong behavior on a plausible path), `out of scope` (the right fix is real work beyond the plan), or, for a held lane, `retry` (with the guidance the user gives). Decision starts `pending` and ends `accepted`, `fixed (<short sha>)`, `out of scope`, or `retried`. Rows are table cells, not to-do blocks, so the checkbox audit never reads them.

**Recording.** Write a row when its lane lands or is held, its ruling is made, or its task is ticked (inline), always before yielding, by rewriting the overview with write_doc per `skills/_shared/storage-resolution.md` (on the filesystem backend the edit rides the end-of-run plan-file commit).

**The end-of-run question.** When every lane has landed or is held, run the completion audit if every task is ticked and add its For your decision items as rows. Then, if any row is `pending`, print the pending rows with their recommendations and ask **one** `AskUserQuestion`:
- **Apply every recommendation** `(Recommended)` — or, through the free-text answer, name overrides (`R3 fix`, `R5 accept`, a held lane's guidance) and apply the rest as recommended.
- **Stop here** — every row stays `pending`; the plan stays `in-progress`.

Write each decision to the table as it is applied. **Accept** marks `accepted`. **Out of scope** writes a plan-side `99-out-of-scope` entry (rationale plus a wikilink to the task). **Retry** re-dispatches the held lane with the user's guidance and resumes the run. **Fix**: apply every Fix row yourself in the main checkout, following the implementer's rules (root cause first, `Tests:` evidence), one commit per row (`fix(review): R<n> <summary>`), then mark it `fixed (<short sha>)`; a fix that turns out to be real work becomes Out of scope.

**Re-audit.** When any row was fixed or retried, run the audit once more, passing the table so the branch review skips decided rows; new pending rows get one more grouped question.

**The gate.** Set `implemented` only when the audit passes (or passes with warnings only) and no row is `pending`.

## Completion-time gate: dispatch `cadence-completion-auditor` directly

Once every task is ticked:

1. Verify every step `- [x]` and each task's commit is in `git log`.
2. **Worktree-cleanup sweep:** confirm `git worktree list` shows no `cadence/lane-*` worktree and `git branch --list 'cadence/lane-*'` is empty. Remove leftovers with `git worktree remove <path>` and `git branch -d <branch>`, never `--force` or `-D`: a leftover lane that still holds work is a defect, and deleting it silently hides it. If either refuses, show the user `git -C <path> status --porcelain -uall` or `git log --oneline HEAD..<branch>` and ask whether to keep, commit, or discard that work.
3. Dispatch `cadence-completion-auditor` **directly** via the `Task` tool, with the same parameters `/c-audit` passes: plan path, linked design (from `linked_design:`) or the source paths, resolved config JSON, diff range (`git diff <base_sha>..HEAD`), mode `gating`, the plan slug (the auditor exports Notion plans with `scripts/notion-read.js`), and the Review decisions table when there is one. Never route through the `/c-audit` skill; the audit logic lives in the agent.
4. Read the report.

| Auditor result | `/c-execute` response |
|---|---|
| All pass (or warnings only) | Add For your decision items as rows and run the end-of-run question; once no row is `pending`, set status to `implemented` (set_status bumps `updated:`) and print: *"Plan implemented. Deploy your changes, then run `/c-validate <path>`. To re-run the audit later, use `/c-audit <plan-path>`."* Per `skills/_shared/browser-validation.md`, add one line recommending a browser runner **only if** the plan's `96-validation.md` has a Category B item with an `e2e:` reference and no runner is configured or detected. |
| Any blocking failure | Leave status at `in-progress`. Surface the failing audits (a Critical branch-review finding blocks like any other). User picks fix, mark out of scope, or abort. |

## What `/c-execute` doesn't do

- Doesn't deploy or run `/c-validate`.
- Doesn't touch the design.
- Doesn't continue past an audit failure silently.
- Doesn't aggregate commits, amend, or skip hooks.
- Doesn't read the whole repo on any dispatch.
- Doesn't house audit logic: that lives in `cadence-completion-auditor`, which `/c-audit` also dispatches.

## References

- Companion agents: `cadence-implementer`, `cadence-reviewer`, `cadence-completion-auditor`.
- Standalone audit skill: `/c-audit`.
