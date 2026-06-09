---
name: c-worktree
description: "Full git-worktree lifecycle for isolated interactive sessions — create an isolated worktree, optionally run its dev server on a dedicated port, merge it back behind a shared lock, and clean up. Generic and standalone: works in any git repo with no Cadence design, plan, or other /c-* skill; merges are lock-guarded so they serialize with /c-execute lane landings and other sessions. Use whenever starting isolated or parallel feature work, spinning up a worktree, asking which port a worktree's dev server runs on, or merging/integrating a worktree branch back to its base — from the feature session OR from the main worktree. Use it even when the user just says 'new worktree', 'isolate this', 'merge my branch back', or 'serialize these merges'."
---

# `/c-worktree`

You own the whole arc of an interactive worktree session: **create → run dev
server → merge back → clean up**, plus a deploy guard where a repo configures one.
Generic where it can be (plain git plus a merge lock that works in any repo) and
repo-aware only through optional config hooks. Pick the phase that matches the
request — you rarely run all of them in one turn.

## Invocation

- `/c-worktree` or `/c-worktree create [<branch>]` — create an isolated worktree
  (always asks for the base branch).
- `/c-worktree merge [<feature>]` — merge a feature branch home, lock-guarded.
  From a feature worktree with no arg, the current branch merges to its recorded
  parent; from the target worktree, `<feature>` merges into the current branch.
- `/c-worktree cleanup [<feature>]` — stop the dev server, remove the worktree,
  delete the branch, release the port.

Bare phrasing maps to phases too: "new worktree" → create; "merge my branch back"
→ merge; "tear down this worktree" → cleanup.

## The standalone-generic guarantee

`/c-worktree` requires **no Cadence design, no plan, and no other `/c-*` skill**
at runtime. It works in any git repo. With an empty or absent `worktree:` config
(or no `.cadence/config.yaml` at all), only the generic core runs: plain
`git worktree add`, a lock-guarded merge, and cleanup. The `references/merging.md`
menu and the merge lock (`scripts/merge-lock.sh` at the plugin root) are the only
non-trivial generic pieces.

## Config

Read the `worktree:` section of `.cadence/config.yaml`; defaults come from
`${CLAUDE_PLUGIN_ROOT}/defaults/config.default.yaml` (a repo with no config file
gets pure defaults):

| Key | Default | Meaning |
|---|---|---|
| `worktree.dir` | `.cadence/worktrees` | where worktrees live |
| `worktree.integrate` | `rebase-ff` | integrate policy (`rebase-ff` \| `merge-commit`); sets the merge menu's recommended option |
| `worktree.merge_lock` | `true` | acquire the shared merge lock around the merge's git operations |
| `worktree.lock_stale_threshold` | `600` | seconds before a held lock surfaces "steal it?" (never auto-steal) |
| `worktree.hooks.*` | all `null` | the five optional repo hooks (`provision`, `port_assign`, `port_release`, `dev_server`, `deploy_guard`) |

**One-release legacy fallback:** if `worktree.dir` is absent, read the legacy
`execute.worktree_dir`; if `worktree.integrate` is absent, read the legacy
`execute.integrate`. The new keys always win when present.

**Null hook = phase absent.** Every hook defaults to `null`. A null `dev_server`
means this repo has no dev-server phase; a null `deploy_guard` means it has no
deploy phase. Never improvise a substitute for an unset hook.

## Hook execution contract

Hooks are shell commands run at fixed lifecycle points. This contract is
everything a hook may rely on (the public config reference restates it):

- **Environment:** every hook runs with `WT_PATH` (absolute worktree path),
  `MAIN_ROOT` (absolute main-worktree path), and `BRANCH` (the worktree's branch)
  exported. `dev_server` additionally gets `DEV_PORT` (captured from
  `port_assign` stdout, or read back from `git config branch.<branch>.devPort`).
- **Working directory:** `provision`, `port_assign`, and `dev_server` run with
  cwd = `$WT_PATH`. `port_release` runs with cwd = `$MAIN_ROOT` (the worktree may
  already be removed). `deploy_guard` runs in the directory the deploy was
  attempted from (that location is what it judges).
- **Stdout:** only `port_assign`'s stdout is contract-bearing (the assigned
  port). Other hooks' output is informational and surfaced to the user.
- **Non-zero exit:** `provision` failure → surface it and offer to remove the
  half-created worktree (never leave one silently broken). `port_assign` failure
  → surface it and continue without a port (the dev-server phase is then
  unavailable). `dev_server` failure → surface it. `port_release` failure →
  surface it but continue cleanup. `deploy_guard` failure → refuse the deploy and
  explain the merge-first-then-deploy-from-main flow.
