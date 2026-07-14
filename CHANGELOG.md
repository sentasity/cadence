# Changelog

All notable changes to Cadence are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow semver.

## v0.11.0 (2026-07-14)

Notion mode renders natively: obsidian callouts, wikilink cross-references, and Mermaid diagrams become real Notion blocks instead of escaped text, and the mode now requires Notion's official MCP.

### Changed

- **Notion mode now requires Notion's official MCP** (previously: any Notion MCP, discovered by capability). Native rendering of Cadence's house syntax needs the official MCP's documented Notion-flavored Markdown format, so Notion mode targets it specifically, identified by its stable `notion-*` tool surface; the per-install server id is still resolved at runtime and never stored in config. A repo in Notion mode without the official MCP hard-fails with an actionable install message instead of driving an arbitrary MCP. Docs: `reference/notion-mode` and the `storage` config section updated accordingly.

### Fixed

- **A literal `|` in a table cell no longer breaks the table in Notion.** A GFM pipe-table cell containing a literal `|` (for example `` `SfnStartResult | None` ``) was read as a column delimiter and split the row. Neither GFM's `\|` escape nor the `&#124;` entity renders correctly through the Notion MCP, so Cadence now authors tables to avoid cell-internal pipes (reword, or emit that one table as a Notion-flavored `<table>` block); see `skills/_shared/obsidian-format.md` and `skills/_shared/notion-translation.md`.
- **Obsidian callouts and wikilinks now render as native Notion blocks instead of escaped literal text.** The first cut of Notion mode handed raw obsidian-flavored markdown to the MCP, which escaped `> [!summary]` and `[[slug]]` into `> \[!summary\]` and `\[\[slug\]\]` and rendered callouts as plain quote blocks with no icon, color, or callout affordance, because `[`, `]`, `<`, `>` are must-escape characters in Notion-flavored Markdown. The notion backend now translates callouts to native `<callout>` blocks (per-type icon and background color, body kept inside) and wikilinks to `<mention-page>` page mentions via a two-pass `resolve_links` step, before handing the body to the MCP; Mermaid fences render as native diagrams. The mapping lives in the new `skills/_shared/notion-translation.md`. `resolve_links` was specified in the original design but never shipped; it is now built and invoked by `/c-design` and `/c-plan` after their batch writes. Verified by round-trip against the official Notion MCP.

## v0.10.0 (2026-07-10)

Notion mode: a per-repo backend switch that stores Cadence's brainstorm stubs, designs, and plans in two Notion databases instead of the local filesystem, so the artifacts teams most want to review, board, and roadmap live where the humans already work. Filesystem behavior is byte-for-byte unchanged and stays the default.

### Added

- **`storage.backend: filesystem | notion` config switch** (`config_version` 4 → 5). A new top-level `storage:` block (`backend`, plus `notion.root_page` / `notion.designs_db` / `notion.plans_db`) opts a repo into Notion mode. The default `filesystem` is exactly today's behavior; the whole block is team policy and belongs in the committed `.cadence/config.yaml`. The `config_version` bump is additive: `scripts/migrate-config.js` appends the new block verbatim with no code change (confirmed by a new migration test), and this repo's own dogfood config migrates to v5 at the filesystem default.
- **Two Notion databases, provisioned and owned by Cadence.** In Notion mode a Designs database and a Plans database are created under one configured root page on the first run. Each artifact is a row (frontmatter maps to Status / Date / Multi-select properties, plus a machine-owned Slug), child docs are sub-pages that keep their `NN` ordering prefix, and the design-to-plan link becomes a bidirectional Relation. Cadence auto-provisions the databases, writes their ids back into committed config, and owns the schema and future schema migrations.
- **`skills/_shared/storage-resolution.md` storage-resolution layer.** A single shared doc defines the abstract artifact operations (read an artifact, write a doc, link, set status, tick a checkbox, resolve a slug) and branches filesystem-versus-Notion in exactly one place, following the `config-resolution.md` precedent. Every `/c-*` skill routes its artifact I/O through it and stays backend-agnostic. The Notion branch discovers whatever Notion MCP is present at runtime (no hardcoded tool names), hard-fails rather than falling back to the filesystem when none is usable, and confines all Notion writes in `/c-execute` to the PM so there are no concurrent writes.
- **Notion mode docs.** A new `/reference/notion-mode/` page (what it is, the three-step setup, the two databases, what changes and what does not) plus a `storage` section in the config reference documenting the four keys and their team-policy status.

## v0.9.0 (2026-06-11)

A post-provision health check for `/c-worktree`: the new `provision_verify` hook lets a repo assert a freshly-provisioned worktree's environment is actually usable, instead of trusting the `provision` hook's exit code.

### Added

- **`provision_verify` worktree hook** (`worktree.hooks.provision_verify`, default `null`): a sixth optional hook `/c-worktree` runs at create time, after `provision` and before `port_assign`. It asserts the provisioned environment is usable (for example, `cd backend && uv run python -c "import yaml, moto"`), independent of what `provision`'s own exit code claimed. On a non-zero exit the skill surfaces the output and offers repair (re-run `provision`, then re-verify), remove, or keep. Additive and backward compatible: no `config_version` bump, and a repo that does not set it keeps today's behavior. Documented across `skills/c-worktree/SKILL.md`, `skills/_shared/worktree-lifecycle.md`, and the config and `/c-worktree` reference pages.

### Changed

- **`/c-worktree` always surfaces the `provision` hook's stderr at create time, even on a zero exit.** A best-effort provisioner that warns and exits 0 no longer hides the warning until the first push. The config reference also documents the post-checkout-git-hook versus skill double-run interaction that `provision_verify` makes moot for correctness.

## v0.8.0 (2026-06-10)

Personal config overrides: a gitignored `.cadence/config.local.yaml` overlay for preferences that legitimately differ per person or per machine, now that team repos can commit their `.cadence/config.yaml`.

### Added

- **`config.local.yaml` personal-override layer.** Config now resolves through three layers, last definition winning per key path: plugin defaults, the repo's `.cadence/config.yaml`, then a personal `.cadence/config.local.yaml`. The new `skills/_shared/config-resolution.md` is the single authority; every config-reading skill and agent cites it. The local file is sparse (overrides only), carries no `config_version`, is never touched by `scripts/migrate-config.js`, and must be gitignored (Cadence adds the ignore line when it finds the file un-ignored). Overrides of team-policy keys (paths, audits, plan policy, the `worktree:` section) are honored but surfaced with a one-line notice; the intended local keys are the per-person/per-machine ones (`execute.max_parallel`, `execute.worktree_confirm`, `authoring.max_parallel`, `authoring.design_mode`, `validate.browser_*`, `advisors.*`). Documented in the config reference's new "Local overrides" section.

### Fixed

- **`/c-worktree` branch-deletion guidance covers the HEAD-anchored merged-check.** `git branch -d` can refuse after a clean ff/merge-commit merge when the current HEAD doesn't contain the target's new commits; `references/merging.md` and the cleanup phase now document the briefly-check-out-the-target fix (and that this is not a `-D` case). Found during the worktree-unification validation walk.

## v0.7.0 (2026-06-09)

Worktree unification: one config-driven git-worktree lifecycle, shared by the new interactive `/c-worktree` utility command and `/c-execute`'s parallel lanes.

### Added

- **`/c-worktree` skill** (`skills/c-worktree/SKILL.md` + `skills/c-worktree/references/merging.md`): the interactive git-worktree lifecycle as a standalone utility command, not a pipeline stage. Create (base selection asks, never assumes; the base is recorded as `git config branch.<branch>.parent`), optional dev server, lock-guarded merge back (all interaction happens before the lock; merge-type menu from `references/merging.md`), cleanup (dev server killed by the recorded `devPort`, never an assumed port), and a config-gated deploy guard that refuses and explains but never deploys. The generic core works in any git repo with no `worktree:` config at all.
- **Top-level `worktree:` config section** (`config_version` 3 → 4): `dir` and `integrate` (relocated from `execute.worktree_dir` / `execute.integrate`), `merge_lock` (default `true`), `lock_stale_threshold` (default `600` seconds), and five optional shell-command hooks (`provision`, `port_assign`, `port_release`, `dev_server`, `deploy_guard`) with a pinned execution contract (exported `WT_PATH` / `MAIN_ROOT` / `BRANCH` / `DEV_PORT` env, per-hook cwd, stdout semantics, per-hook failure semantics). A `null` hook means that lifecycle phase does not exist.
- **Shared merge lock** (`scripts/merge-lock.sh` + `scripts/test-merge-lock.sh`): a repo-global lock in the git common dir, acquired by both `/c-worktree` merges and `/c-execute` merge-on-land, so an untracked concurrent merge into the same integration branch serializes instead of colliding. On by default; a stale lock is surfaced with the holder's branch, worktree path, and age, and is never stolen automatically.

### Changed

- **`/c-execute` merge-on-land acquires the shared merge lock** (gated by `worktree.merge_lock`), with WAITING-poll and stale-quiesce paths. Lane formation, the DAG, the `Touches:` guard, and the two-stage review model are unchanged.
- **The `config_version` 3 → 4 migration is a value-move, not a plain insert.** `execute.worktree_dir` / `execute.integrate` relocate to `worktree.dir` / `worktree.integrate`, and customized legacy values are carried across so an inserted default can never shadow them. Skills read the new keys with a one-release fallback to the legacy `execute.*` keys; the migrator never deletes the legacy keys, and its console message advises removing them manually.
- **Docs site**: new `/c-worktree` reference page; the config reference gains the `worktree` section (including the hook execution contract) and drops the relocated `execute.*` rows behind a fallback note; the parallelism concept page points at `worktree.integrate` and notes the shared lock; install-page command counts move nine → ten with a note that the tenth is a utility, not a pipeline stage.

### Why

Two unrelated worktree systems existed side by side: `/c-execute`'s autonomous lane worktrees (config-driven, shipped in the plugin) and a user-global interactive `/wt` skill (full lifecycle with dev server and deploy guard, repo specifics hardcoded in prose, never published). Unifying them yields one config-driven lifecycle core: the interactive flow ships in the plugin as `/c-worktree`, repo-specific behavior moves into the `worktree.hooks.*` config, and the shared merge lock lets a human-driven merge and an autonomous lane landing into the same branch serialize instead of colliding. The user-global `/wt` skill retires once behavior parity is confirmed.

## v0.6.0 (2026-05-29)

Parallelism amendment: lane = phase file. Fewer, fatter worktrees; chunkier authoring.

### Changed

- **`/c-execute` lane formation: greedy chain extension → lane = phase file.** The PM now forms one lane per phase file from the ready subset of its tasks (`eligible(F)` = ready ∩ disjoint-`Touches:` with in-flight). Internal `Depends:` order the implementer's steps inside the warm worktree; cross-file `Depends:` sequence lanes. Partial readiness emits a follow-up lane from the same file when blockers clear. The DAG, the `Touches:` guard, parallel reviewers, the worktree lifecycle, rebase-then-ff integration, quiesce-on-block, and the `merge-integrity` audit all stand unchanged. Supersedes the `2026-05-21-cadence-parallelism` design's greedy-chain-extension rule; the rest of that design stands.
- **`/c-plan` authoring stance: fewer, coherent phase files.** New `Phase file sizing` subsection in `skills/c-plan/SKILL.md` targets one substantive topic per file with 5–10+ tasks. Three anti-patterns documented (mixed-topic file, sprawling monolith, fragmented file). Writing-flow step 2 reframes from per-feature splitting to minimal coherent grouping. Self-review pass gains two detectors (fragmented-file across siblings; pairwise zero-`Reads:` within a file) that surface candidates to the user — never auto-merge or auto-split. Per-task contract (`Reads:`/`Touches:`/`Depends:`/`Steps`) is unchanged.

### Why

The v0.4.0 parallelism release introduced worktrees to expedite parallel work. In practice, the greedy chain-extension lane-formation rule produced singleton lanes on the common fan-out shape (a setup task, then a spread of independent siblings) — one worktree per fan-out task, the worktree spin-up cost dominating the saved parallelism. Users observed "1 task per worktree, which just makes it longer." This release replaces the chain-extension rule with `lane = phase file`: every ready task from one `0X-*.md` file batches into one warm worktree with one implementer and one review pass. The companion `/c-plan` stance change consolidates related work into fewer, larger phase files so each lane carries meaningful work.

## v0.5.1 (2026-05-27)

### Fixed

- **Config-migration hook now fires on every session-start source.** The `SessionStart` hook matched only `startup`, so sessions begun via `/clear`, `--resume` / `--continue`, or compaction never triggered migration — only a cold relaunch did. Removed the `matcher` so the hook runs on all sources (`startup` / `resume` / `clear` / `compact`). The migration script is idempotent and silent when the config is already current, so firing on every source is harmless.

## v0.5.0 (2026-05-27)

Reliability + validation-speed release: config updates that actually reach existing repos, and browser-driven post-deploy validation.

### Added

- **Deterministic config migration via a `SessionStart` hook** (`hooks/hooks.json` + `scripts/migrate-config.js`, zero-dependency Node). On every session it backfills missing default keys into a repo's `.cadence/config.yaml` (additive text-merge — preserves the user's values and comments), bumps `config_version`, and prints a one-line notice. Fail-safe: never throws to the hook, never writes on unparseable input, silent no-op when a repo has no `.cadence/config.yaml`.
- **Browser-automation for `/c-validate` Category B.** New flat `validate.browser_driver | browser_command | browser_env_preamble` config + shared spec (`skills/_shared/browser-validation.md`). `/c-validate` delegates a Category B item to the project's CLI test runner (Playwright default) when the item carries an optional `e2e:` reference, maps the exit code to the checkbox (failures route through existing failure handling), and falls back to manual otherwise. `/c-plan` authors `e2e:` refs; `/c-execute` surfaces a one-line runner recommendation when a plan has `e2e:` steps but no runner is configured. Credential-agnostic — secrets stay in env / the project's harness, never in committed config.
- **`skills/_shared/progress-checkpoint.md`** — shared invariant: `/c-execute` and `/c-validate` flush completed checkboxes to disk before any pause (question, manual step, failure stop, block), so progress survives a context loss.

### Changed

- **Per-skill config-migration pre-flight removed** from `/c-brainstorm`, `/c-design`, `/c-plan`, `/c-execute`, `/c-validate` — the `SessionStart` hook now owns migration. `/c-brainstorm`'s scaffold derives `config_version` and the key set from defaults instead of hardcoding them; `skills/_shared/config-migration.md` is reduced to a pointer stub.
- **`config_version` 2 → 3** — adds the `validate.browser_*` keys, delivered to existing repos by the new migration hook.

### Why

Config migration was silently broken — the routine compared against a bare relative path that resolved from the user's working directory, not the plugin root, so it never found the defaults and never ran. Any new setting Cadence shipped therefore never reached existing repos. Fixing it first unblocked the browser-validation feature, whose new keys ride the now-working migration (and are flat, not nested, so the migration backfills them cleanly). Both features were designed, planned, and executed end-to-end with Cadence itself; completion audits passed clean.

## v0.4.0 (2026-05-22)

Parallelism release — two halves of one initiative: faster execution and faster, less-fragmented authoring.

### Added

- **DAG-scheduled parallel execution in `/c-execute`.** The PM builds a dependency DAG from each task's `Depends:` edges and runs independent **lanes** concurrently, each in its own git worktree, merging each lane back the moment it lands (rebase-then-fast-forward by default). Replaces the old "walk phase files in order, one task at a time" model. Concurrency capped by `execute.max_parallel` (default 4); reviewers run on top, uncapped.
- **`Reads:` / `Touches:` / `Depends:` task contract.** Tasks now declare context files (`Reads:`), written files (`Touches:`), and dependency edges (`Depends:`). `Touches:` drives a hard file-conflict guard: two lanes co-schedule only when their `Touches:` sets are disjoint.
- **Parallel two-stage review.** `cadence-spec-reviewer` and `cadence-code-reviewer` now run concurrently over a lane's cumulative diff (spec still wins on conflict).
- **Self-managed worktree lifecycle** (`skills/_shared/worktree-lifecycle.md`) — Cadence drives `git worktree` itself; no runtime dependency on external skills. One-time pre-flight confirmation before the first worktree; quiesce-on-block; resume prunes stale lane worktrees.
- **`merge-integrity` audit** in the completion-gate roster — confirms no leftover lane worktrees/branches, no stray commits, no conflict residue before a plan flips to `implemented`.
- **Parallel doc generation + `cadence-doc-consistency` sweep agent.** `/c-design` (all-at-once mode) and `/c-plan` fan out one generator agent per child doc, then a sweep agent reconciles trivial wording and surfaces substantive cross-doc contradictions to the user.
- **`/c-design` generation-mode toggle** — all-at-once (default) vs one-by-one.
- **Versioned config + migration** (`config_version`, `skills/_shared/config-migration.md`). New keys: `execute.parallel`, `execute.worktree_dir`, `execute.worktree_confirm`, `execute.integrate`, `authoring.max_parallel`, `authoring.design_mode`. On config drift, mechanical keys default silently with a notice; preference keys (`worktree_dir`) prompt once.
- **DAG-soundness lens** in `/c-check` and `/c-find-bugs` — flags two tasks that reference each other with no `Depends:` edge (the parallel-execution hazard the `Touches:` guard can't catch) and `Depends:` cycles.

### Changed

- **One design → one plan.** `/c-plan` always produces a single plan folder with phase docs; multi-plan splitting and the `linked_plans:` array are retired in favor of singular `linked_plan:`. `/c-validate` drops its sibling-plan graph and completes a design when its one plan completes.
- **Plan task format migration.** `Files:` / `Parallel:` are replaced by `Reads:` / `Touches:` / `Depends:`. Existing plans still run unchanged via a legacy sequential fallback (`/c-execute` detects format per-plan); set `execute.parallel: false` to force sequential.
- **`cadence-implementer` is write-restricted to its `Touches:` list** — writing outside it returns `BLOCKED`, so the concurrency guard is trustworthy.
- **`/c-plan` always batches doc generation; tighter task blocks.** `templates/`, `_shared/frontmatter.md`, `_shared/obsidian-format.md`, and the `hello-cadence` example were migrated to the new format.

### Why

`/c-execute` was over-serialized — every task ran a fresh implementer then two sequential reviewers, and no phase started until the previous one fully landed. Authoring mirrored the problem: child docs written one at a time, and a single design fanning out into multiple linked plans that needed sibling-graph bookkeeping. This release parallelizes both, isolates concurrent writers in worktrees with a conflict guard, and consolidates to one-design-one-plan. Designed and built with Cadence itself (on the legacy sequential path), then audited clean.

## v0.3.2 (2026-05-19)

### Fixed

- **`AskUserQuestion` calls were skipping the `(Recommended)` pick and plain-English framing — especially on triage/exploration menus.** Observed in `/c-brainstorm` thought-partner mode: questions like *"What next?"* / *"which thread first?"* presented bare option lists with no recommendation and no top-level summary of what was being decided. The rule existed in `skills/_shared/ask-user-question.md`, but (a) it was framed only around trade-off decisions, so navigation menus read as exempt, (b) it never said the recommended option must be listed first, and (c) it lived in a referenced file that isn't auto-loaded into context at skill runtime, so the model rarely saw it.

### Changed

- **`skills/_shared/ask-user-question.md`:** recommendation is now required even for "which should we look at first?" triage/exploration menus ("your call" is a non-answer); the `(Recommended)` option must be **listed first**; triage menus added to the "When this rule applies" list; yes/no gates list the recommended answer first.
- **Inlined a self-contained "Hard gate" block into all six interactive skills** (`c-brainstorm`, `c-check`, `c-find-bugs`, `c-execute`, `c-audit`, `c-explain`) instead of relying on the soft cross-reference. Each states the three non-negotiable checks (plain-English lead, one `(Recommended)` listed first, per-option trade-off) directly in the `SKILL.md` so the rule is in context at runtime. `/c-brainstorm` carries the fullest version near the top since its conversational flow is the highest drift risk.

### Why

A user reported that cleanup brainstorming (and likely other skills) presented items to consider without surfacing which one to pick first, and without a top-of-question summary to orient by. Soft prose references weren't enough; the fix is a prominent, in-context hard gate.

## v0.3.1 (2026-05-18)

### Fixed

- **`/c-execute` resume protocol was silently broken since v0.1.0.** The framework specified that the PM checks off plan-file steps after both reviews pass, and the resume protocol declared *"plan file's checkbox state is the only source of truth"* — but `/c-execute`'s PM-responsibilities list never told the PM to actually edit the plan file. As a result, no task was ever marked `- [x]`, re-invoking `/c-execute` always started from Task 1.1, and the completion-time audit gate (which checks for `- [x]`) could never let a plan flip to `implemented`.

### Added

- **`## Marking task complete` section in `skills/c-execute/SKILL.md`.** Explicit, mandatory step: after spec ✓ + code ✓ + commit-in-`git log` + Invariant 3 grep clean, the PM edits the phase file to flip every `- [ ]` step under `### Task N.M` to `- [x]`. In-file parallel tasks update checkboxes as each lands, not in a batch.
- **Two-stream commit model in the `## Commits` section.** Code commits remain per-task (driven by the implementer's last step). Plan-file edits (checkbox flips + final status flip) accumulate as dirty working-tree state during execution and commit ONCE at the end, after the audit gate passes — message default `chore: mark plan implemented`. Per-task plan-file commits are forbidden; they double commit count without adding information the working tree doesn't already carry.
- **Resume-protocol clarification:** dirty tree with ONLY plan-file edits on the plan being resumed is expected mid-execution state; the PM continues. Any other dirty files (code, tests, other plans) still surface and stop. Mirrored in `designs/2026-05-17-cadence/04-execute.md`.

### Why

Surfaced when a user noticed `/c-execute` left every plan task at `- [ ]` after running, breaking the resume contract entirely. The fix is a documentation gap in the skill spec, not a logic change — the PM behavior described elsewhere in the doc was simply never linked to a concrete action.

### Compatibility

- No breaking changes. Skill names, agent names, config keys, frontmatter contracts, and the `/c-audit` dispatch path are all unchanged.
- Plans created or resumed under v0.3.1 will now correctly mark steps complete and resume from the first unchecked task.
- Plans previously stuck at every-step-unchecked under v0.1.0–v0.3.0 will continue to start from Task 1.1 on `/c-execute` re-invocation. To recover an in-flight plan, either manually check off the steps for tasks whose commits are visible in `git log`, or use `--restart` and re-run from scratch.

## v0.3.0 (2026-05-18)

### Added

- **`/c-explain`** — interactive discussion of an existing design or plan. Opens with a one-screen orientation (section list + plain-English summaries + grounded example questions), then drops into open user-driven Q&A. Answers lead with plain English and cite both design sections and code locations when implementation comes up. Doc gaps trigger an investigation chain (design → code → git → related designs); unresolved gaps surface as `[INFERRED]` with the inference chain shown. Artifact-free by default; on exit offers to save a future note or append a Q&A appendix to the design.
  - Targets: design folder, plan folder, single child doc, or sub-section anchor (`<path>#<heading>`).
  - `--any` flag bypasses the Cadence-managed-location structure check for imported / external docs.
  - Distinct from sister diagnostics: `/c-check` reviews substance, `/c-find-bugs` enumerates defects, `/c-explain` explains. The skill redirects to its siblings when the user's question crosses into critique or defect-hunting.

### Changed

- README and skill count updates: nine `/c-*` commands now (six core-flow + three diagnostic).
- **`/c-check` severity calibration.** Tightened the `Critical` tier from "would prevent the design from being implementable or the plan from executing correctly" to "the doc cannot move forward as written; user must stop and resolve before approval or execution." Added explicit examples per tier and a sub-agent heuristic ("if a thoughtful developer could finish the task by picking one interpretation and noting the choice in the PR, it's Important, not Critical"). The skill prompt now includes a "default to Important when uncertain" rule that flows into every sub-agent dispatch, so cross-doc inconsistencies no longer drift into Critical by default.
- **`/c-check` apply-mode entry question.** Replaced three options (walk-critical-only / walk-all / exit) with four: *walk one at a time*, *walk Critical, auto-apply Important + Minor*, *auto-apply everything*, *exit*. Auto-apply uses the report's Fix direction for one-liner fixes and silently picks the `(Recommended)` option for direction-style fixes; prints a per-finding audit line and a batch rollup at the end so the user can spot-check the work.

### Why (c-check changes)

Feedback after running `/c-check` on a real multi-doc design: too many findings landed in the Critical tier (cross-doc inconsistencies a developer could resolve mid-build were flagged as blocking), and the only post-report options were one-at-a-time walks of 20+ findings. Calibration tightening keeps Critical scarce and meaningful; batch apply makes the apply-mode useful on the long tail of clearly-actionable findings without forcing per-finding prompts.

### Compatibility

- No breaking changes. All shipped guarantees from v0.1.0 and v0.2.0 remain.
- Existing eight skills unchanged in invocation contract; `/c-check` behavioral changes are visible inside the report (fewer Critical-tier items) and in the apply-mode entry question (four options instead of three).

## v0.2.0 (2026-05-18)

### Added

- **Thought-partner mode in `/c-brainstorm`.** Brainstorming now runs in one of two modes: thought-partner (exploratory Q&A, no artifact required, ends when the user is satisfied) or design-brainstorm (unchanged — converges on a `00-overview.md` stub). Mode detection is automatic from invocation phrasing; `--explore` and `--design` flags force a mode; the user can switch modes mid-session.
- **`skills/_shared/ask-user-question.md`.** Canonical spec for question text and option formatting whenever `AskUserQuestion` is the primary decision surface. Requires plain-English framing of what's being decided, a progress line when walking a list, exactly one `(Recommended)` option per question, and a one-sentence trade-off in each option's description. Includes a bad→good worked example.

### Changed

- **`/c-check` apply-mode walk.** Per-finding questions now require a rolling progress line (`Finding 14/17 — 8 applied, 5 skipped so far`), a plain-English TL;DR of what's wrong and why it matters, and an explicit two-question pattern (Apply/Skip/Mark-as-decided, then a concrete-options sub-question when the fix is a direction). Bare technical labels no longer suffice as question text.
- **`/c-find-bugs` fix-mode walk.** Same plain-English + progress-line + `(Recommended)` requirement applied to per-defect questions.
- **`/c-execute` drift handling and `/c-audit` failure response paths.** Both now reference the shared `AskUserQuestion` spec; question text must include enough context to decide without scrolling back through the conversation.

### Why

After a `/c-check` apply-mode walk on a large design (~50 findings), the user reported losing context by question 14 — the bare option labels and section cites weren't enough to decide without scrolling. This release codifies the rule that decision-surface questions must be self-contained.

### Compatibility

- No breaking changes. All shipped guarantees from v0.1.0 (skill names, agent names, config keys, frontmatter contracts) remain.
- Existing `/c-brainstorm <topic>` invocations still work; mode detection picks design-brainstorm for design-flavored phrasing, preserving prior behavior.

## v0.1.0 (2026-05-17)

Initial release. Bootstrap shipped via `superpowers:writing-plans` and `superpowers:subagent-driven-development` across five sibling plans:

1. **Foundation** — `LICENSE`, `.gitignore`, `.claude-plugin/{plugin,marketplace}.json`, `defaults/config.default.yaml`, `templates/design/*` (5 files), `templates/plan/*` (6 files), `README.md` skeleton.
2. **Agents** — `cadence-implementer`, `cadence-spec-reviewer`, `cadence-code-reviewer`, `cadence-completion-auditor` (orchestrator + audit-prompt library).
3. **Core-flow skills** — `/c-brainstorm`, `/c-design`, `/c-plan`, `/c-execute`, `/c-audit`, `/c-validate`, plus `skills/_shared/{frontmatter,obsidian-format}.md`.
4. **Diagnostic skills** — `/c-check`, `/c-find-bugs`.
5. **Polish** — `examples/hello-cadence/` (complete worked design + plan), finalized README, `CONTRIBUTING.md`, this file.

### Shipped guarantees

- The eight `/c-*` skill names are part of the v0.1 contract. Future releases will not rename them without a deprecation cycle.
- The four agent names (`cadence-implementer`, `cadence-spec-reviewer`, `cadence-code-reviewer`, `cadence-completion-auditor`) are part of the v0.1 contract.
- The plugin defaults in `defaults/config.default.yaml` are stable; future releases may add keys but won't remove or rename existing ones.
- Bidirectional linkage (`linked_design:` on plan, `linked_plans:` on design, `base_sha:` on plan) is the canonical contract for status propagation. Future releases will not change the frontmatter keys without migration.

### Known v0.1 limitations

- **`build-validator` ships unconfigured** — `audits.build_validator.command: null` by default. Repos must set it (or remove `build-validator` from `audits.default`) before `/c-execute` will pass the audit gate. This is deliberate (explicit-choice posture).
- **No CLAUDE.md migration yet** — Cadence v0.1 coexists with existing brainstorming/planning conventions in user CLAUDE.md files. CLAUDE.md cleanup is deferred until post-soak (≥3 real designs through Cadence to `completed` + subjective user confidence).
- **No hook integration** — Cadence v0.1 is hook-free; future versions may add hooks for branch protection, automatic `/c-check` on design saves, etc.
- **No PR creation skill** — Cadence v0.1 doesn't open PRs. Users land commits and create PRs manually via `gh pr create` or equivalent.

### Deferred for future versions

- CLAUDE.md cleanup migration (per [`docs/designs/2026-05-17-cadence/10-migration.md`](https://github.com/sentasity/cadence) in the source repo, if you cloned the design folder locally).
- TypeScript-native plan format (current is Python-flavored).
- PR-creation skill.
- Cost telemetry (track tokens per `/c-execute` run).
- Multi-repo plans (one plan spanning multiple repos).

### Compatibility

- Requires Claude Code (no other runtime).
- Requires the user's repos to be git repos.
- Requires Python 3 + PyYAML available in the user's environment for default-config validation (most installs have these).
