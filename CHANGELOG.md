# Changelog

All notable changes to Cadence are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow semver.

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
