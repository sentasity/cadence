# Worktree lifecycle (shared by /c-execute and /c-worktree)

Authoritative reference for the self-managed git worktree lifecycle Cadence uses to isolate concurrent implementer lanes (/c-execute) and to host interactive feature worktrees (/c-worktree). Cadence drives these commands itself; it never invokes the superpowers `using-git-worktrees` skill at runtime.

Config keys live in the top-level `worktree:` section of `.cadence/config.yaml` (`worktree.dir`, `worktree.integrate`, `worktree.merge_lock`, `worktree.lock_stale_threshold`, `worktree.hooks.*`). For one release, skills fall back to the legacy `execute.worktree_dir` / `execute.integrate` when the new keys are absent.

## Naming

- **Worktree path (lanes):** `<worktree.dir>/lane-<id>/` (default `.cadence/worktrees/`; gitignored; see Safety).
- **Lane branch:** `cadence/lane-<id>`.
- `<id>` is a short unique token per lane (e.g. zero-padded counter or first ready task id, `1-1`).
- Interactive `/c-worktree` worktrees live under the same `<worktree.dir>` with user-chosen names; they are NOT `lane-*` and never use `cadence/lane-*` branches.

## Lifecycle commands

| Event | Command |
|---|---|
| Open (lane start) | `git worktree add -b cadence/lane-<id> <worktree.dir>/lane-<id> <working-tip>` |
| Work | implementer edits + commits **inside** the lane worktree only |
| Land (after review) | integrate per /c-execute merge-on-land, then `git worktree remove <worktree.dir>/lane-<id>` and `git branch -D cadence/lane-<id>` |
| Block | leave the worktree in place (preserved for the fix path) |

`<working-tip>` is the current HEAD of the working branch at lane-start, so the lane sees all previously-merged lanes.

## Lifecycle states

| State | Meaning |
|---|---|
| Created | worktree + branch exist; no work yet |
| Running | implementer is editing/committing in the worktree |
| Reviewing | implementer DONE; reviewers reading the lane diff |
| Landing | reviews passed; PM integrating to the working branch |
| Removed | integrated; worktree + branch deleted |
| Preserved | blocked; worktree kept for the fix path |

## Merge lock (shared step)

Both consumers serialize merges through `${CLAUDE_PLUGIN_ROOT}/scripts/merge-lock.sh` (atomic `mkdir` on `<git-common-dir>/worktree-merge.lock`). Gated by `worktree.merge_lock` (default `true`); when `false`, skip acquire/release entirely. The lock is **repo-global**: one lock per repository, not per target branch. `--target` is recorded in `holder.json` for release-ownership matching only, so merges into different branches also serialize (accepted over-caution; merges are short).

- **Acquire (immediately before any integrate):** `bash ${CLAUDE_PLUGIN_ROOT}/scripts/merge-lock.sh acquire --target <integration-branch> --threshold <worktree.lock_stale_threshold>`

| Output | Exit | Meaning | Caller's move |
|---|---|---|---|
| `ACQUIRED` | 0 | lock is ours; `holder.json` written | run the git operations, then `release` |
| `WAITING holder=<branch> age=<s>` | 3 | held and still fresh; this call's wait budget elapsed | re-invoke `acquire` (poll) |
| `STALE holder=<branch> age=<s>` | 2 | held past the threshold | surface steal / wait / abort to the user; **never auto-steal** |

- **Release:** `${CLAUDE_PLUGIN_ROOT}/scripts/merge-lock.sh release` immediately after the git operations. Hold the lock only for the git operations themselves; gather all user input (merge menus, what-will-move reviews, prompts) BEFORE acquiring.
- **Steal:** `${CLAUDE_PLUGIN_ROOT}/scripts/merge-lock.sh steal` only after an explicit user OK on a STALE lock. The steal prompt must carry the holder branch, holder worktree path, and age from `holder.json` so the user can verify the holder is dead (it may be a live merge in another session).
- **Wait budget:** `acquire` returns `WAITING` after an internal default of 540s, sized to return under the 600s Bash tool cap. Poll by re-invoking `acquire`; do not pass a larger `--wait-budget`.
- **Env names:** the script keeps its `WT_LOCK_POLL_INTERVAL` / `WT_LOCK_STALE_THRESHOLD` / `WT_LOCK_WAIT_BUDGET` overrides (it moved verbatim from the retired /wt skill). Skills pass config through flags (`--threshold`), never through these env vars.

## Config hook points

`worktree.hooks.*` are optional shell commands; `null` (the default) means that lifecycle phase does not exist. `/c-worktree` runs them; `/c-execute` lanes never do (lanes are ephemeral and get no dev server, port, or deploy).

| Hook | Fires |
|---|---|
| `provision` | after `git worktree add` |
| `port_assign` | at create, to allocate a dev port (stdout = the assigned port) |
| `port_release` | at cleanup, to free the worktree's port |
| `dev_server` | when the user asks to run the worktree's dev server |
| `deploy_guard` | when a deploy is requested from a worktree context (non-zero exit = refuse) |

Full execution contract (exported env vars, working directory, stdout semantics, failure handling): the `worktree:` section of `defaults/config.default.yaml` and the docs-site config reference (`website/src/content/docs/reference/config.mdx`, `## worktree` section).

## Resume and cleanup

- **On resume** (a re-invoked `/c-execute` session): run `git worktree prune`, then remove any leftover `cadence/lane-*` worktrees and branches from a dead session. Their unmerged work is discarded; the affected lanes re-enter the ready set.
- **Completion sweep:** before flipping a plan to `implemented`, confirm no `cadence/lane-*` worktrees or branches remain — `git worktree list` shows none and `git branch --list 'cadence/lane-*'` is empty. This is asserted by the `merge-integrity` audit.
- **Prune scoping (load-bearing):** the resume prune and the completion sweep must NEVER touch a worktree or branch outside the `cadence/lane-*` pattern. Interactive `/c-worktree` worktrees share `<worktree.dir>`; a sibling directory may be a user's live work. Select removal candidates by the `cadence/lane-*` branch name and `lane-<id>` path pattern, never by "everything under `<worktree.dir>`".

## Safety

- Add `.cadence/worktrees/` to the consuming repo's `.gitignore`. `/c-execute` adds this line on first lane creation if absent.
- Worktrees live under `.cadence/` so they never pollute the working tree or get committed.
- Never `git worktree add` onto an existing path; if `.cadence/worktrees/lane-<id>` exists from a dead session, prune/remove first.
