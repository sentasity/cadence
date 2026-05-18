# Contributing to Cadence

Cadence is a phase-aware system; the contribution flow follows the same phases.

## Before opening a PR

1. **Open an issue first.** Especially for new skills, agent changes, or audit roster additions. Aligning on the problem before writing the change saves both sides a re-litigation pass.
2. **For design changes,** run `/c-check` on the modified design folder. The review report should be clean before you submit.
3. **For plan changes** (e.g. when fixing the bootstrap plans), run `/c-check` on the plan folder and `/c-find-bugs` on the affected code.
4. **For skill or agent prompt changes,** include a smoke-test transcript in the PR description showing the new behavior.

## PR scope

- One concern per PR. Refactor + feature + doc cleanup → three PRs.
- Match the existing commit style: `feat(skills): /c-foo (one-line summary)` for skill additions; `feat(agents): cadence-bar (summary)` for agents; `docs:` for docs.
- Don't squash multiple meaningful commits into one. Cadence's own commit cadence is per-task; PRs should reflect the same shape.

## Code style

- Markdown for skill and agent files — keep the body terse, structure with clear H2/H3.
- YAML for config and frontmatter.
- JSON for plugin manifests (matches Claude Code's expectations).
- No code in this repo (it's documentation + prompts). If you find yourself wanting to write a helper script, ask in the issue first — usually the right answer is "the skill prompt should handle it."

## Tests

No automated test suite ships with Cadence (no code to test). Validation lives in each plan's `98-validation.md` / `96-validation.md` and is walked manually via `/c-validate`. If you change a skill or agent, walk the relevant plan's validation doc as part of your PR.

## What we don't take PRs for

- **Renaming skills** (`/c-brainstorm` → `/c-bs`, etc.). The names are part of the v0.1 contract; breaking them breaks every plan that references them. Naming changes need an explicit migration plan.
- **Adding "easier" entry points** (e.g. a unified `/cadence` umbrella). Explicit phase invocation is a deliberate design choice — see [the design's OOS list](docs/designs/2026-05-17-cadence/99-out-of-scope.md#1-unified-cadence-umbrella-command) in this repo (or your local clone of the source design).
- **Removing the OOS discipline** (rationale + wikilink requirement). The discipline is what keeps `99-out-of-scope.md` from becoming a TODO graveyard.

## License

By contributing, you agree your contribution is licensed under MIT (matches the repo).
