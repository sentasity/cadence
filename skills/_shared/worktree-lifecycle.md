# Worktree lifecycle (shared by /c-execute)

Authoritative reference for the self-managed git worktree lifecycle Cadence uses to isolate concurrent implementer lanes. Cadence drives these commands itself; it never invokes the superpowers `using-git-worktrees` skill at runtime.

## Naming

- **Worktree path:** `<execute.worktree_dir>/lane-<id>/` (default `.cadence/worktrees/`; gitignored; see Safety).
- **Lane branch:** `cadence/lane-<id>`.
- `<id>` is a short unique token per lane (e.g. zero-padded counter or first ready task id, `1-1`).

## Lifecycle commands

| Event | Command |
|---|---|
| Open (lane start) | `git worktree add -b cadence/lane-<id> <execute.worktree_dir>/lane-<id> <working-tip>` |
| Work | implementer edits + commits **inside** the lane worktree only |
| Land (after review) | integrate per /c-execute merge-on-land, then `git worktree remove <execute.worktree_dir>/lane-<id>` and `git branch -D cadence/lane-<id>` |
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

## Resume and cleanup

- **On resume** (a re-invoked `/c-execute` session): run `git worktree prune`, then remove any leftover `cadence/lane-*` worktrees and branches from a dead session. Their unmerged work is discarded; the affected lanes re-enter the ready set.
- **Completion sweep:** before flipping a plan to `implemented`, confirm no `cadence/lane-*` worktrees or branches remain — `git worktree list` shows none and `git branch --list 'cadence/lane-*'` is empty. This is asserted by the `merge-integrity` audit.

## Safety

- Add `.cadence/worktrees/` to the consuming repo's `.gitignore`. `/c-execute` adds this line on first lane creation if absent.
- Worktrees live under `.cadence/` so they never pollute the working tree or get committed.
- Never `git worktree add` onto an existing path; if `.cadence/worktrees/lane-<id>` exists from a dead session, prune/remove first.
