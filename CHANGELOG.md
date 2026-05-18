# Changelog

All notable changes to Cadence are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow semver.

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
