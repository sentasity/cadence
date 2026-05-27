# Changelog

All notable changes to Cadence are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow semver.

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
