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
- Skill/agent text must route config reads through `scripts/resolve-config.js` — never instruct a direct read of `.cadence/config.yaml`, `.cadence/config.local.yaml`, or `defaults/config.default.yaml`. See `skills/_shared/config-resolution.md`.
- No code in this repo (it's documentation + prompts). If you find yourself wanting to write a helper script, ask in the issue first — usually the right answer is "the skill prompt should handle it."

## Tests

The scripts under `scripts/` have a `node --test` suite: run `node --test 'scripts/*.test.js'` before any PR that touches them. Skill and agent prompts have no automated suite; their validation lives in each plan's `98-validation.md` / `96-validation.md` and is walked manually via `/c-validate`. If you change a skill or agent, walk the relevant plan's validation doc as part of your PR.

## Demo GIFs

The README's demo is a real recorded session, not a hand-written transcript. If a change alters what `/c-brainstorm` (or any other demoed skill) shows on screen, re-record with `make demos` (requires `brew install vhs` and an authenticated `claude` with the plugin installed) and commit the updated GIF. See [demos/README.md](demos/README.md) for how the tapes handle Claude's nondeterminism.

## Releasing

A release is three edits landing on `main` together; everything after the push is automated.

1. Add the `## vX.Y.Z (YYYY-MM-DD)` entry at the top of `CHANGELOG.md` (one-line summary, then `### Added` / `### Changed` / `### Fixed` / `### Why` as applicable).
2. Bump `version` in `.claude-plugin/plugin.json` (`marketplace.json` carries no version; leave it alone).
3. Merge/push to `main`.

The `release.yml` workflow then creates the annotated `vX.Y.Z` tag at that commit and publishes a GitHub Release whose notes are the changelog section. A bump with no matching changelog entry fails the workflow on purpose: no entry, no release. Don't hand-create tags or Releases unless the workflow is broken; if you must, match its shape (annotated tag `vX.Y.Z - <headline>`, Release notes from the changelog section).

The `version-guard.yml` workflow enforces the same three edits at PR time: any PR that changes the shipped surface (`skills/`, `agents/`, `hooks/`, `defaults/`, `scripts/`, `.claude-plugin/plugin.json`) must bump the version and add the matching `## vX.Y.Z` changelog section, or the check fails. Website- and docs-only PRs don't touch the surface, so they need no bump. For the rare shipped-surface edit that genuinely isn't user-facing (internal refactor, comment fix), apply the `no-release` label to exempt the PR.

## What we don't take PRs for

- **Renaming skills** (`/c-brainstorm` → `/c-bs`, etc.). The names are part of the v0.1 contract; breaking them breaks every plan that references them. Naming changes need an explicit migration plan.
- **Adding "easier" entry points** (e.g. a unified `/cadence` umbrella). Explicit phase invocation is a deliberate design choice — see [the design's OOS list](docs/designs/2026-05-17-cadence/99-out-of-scope.md#1-unified-cadence-umbrella-command) in this repo (or your local clone of the source design).
- **Removing the OOS discipline** (rationale + wikilink requirement). The discipline is what keeps `99-out-of-scope.md` from becoming a TODO graveyard.

## License

By contributing, you agree your contribution is licensed under MIT (matches the repo).
