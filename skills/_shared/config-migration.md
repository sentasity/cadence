# Config migration (shared by all entry skills)

How Cadence keeps a repo's `.cadence/config.yaml` current as new keys are added. Each entry skill (`/c-brainstorm`, `/c-design`, `/c-plan`, `/c-execute`, `/c-validate`) runs this check in its pre-flight (skills can't call skills, so each follows this routine directly).

## Check

1. Read the repo's `.cadence/config.yaml` `config_version` (absent = treat as 1).
2. Compare to the plugin's current `config_version` in `defaults/config.default.yaml`.
3. If the repo is behind, or expected keys are missing, run migration (below). Otherwise proceed silently.

## Migration

- **Mechanical keys** (`execute.parallel`, `execute.max_parallel`, `execute.worktree_confirm`, `execute.integrate`, `authoring.max_parallel`, `authoring.design_mode`): add at their defaults, print a one-line notice listing what was added. Do not prompt.
- **Preference keys** (`execute.worktree_dir`): prompt once via `AskUserQuestion` with the default (`.cadence/worktrees`) pre-selected as `(Recommended)`.
- **Bump:** write the new `config_version` and added keys back to the repo's `.cadence/config.yaml`, preserving existing user values (never overwrite a key the user already set).

## Notice format

> `.cadence/config.yaml` updated to schema v<N>: added <keys> (defaults). Edit `.cadence/config.yaml` to tune.
