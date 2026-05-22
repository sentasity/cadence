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
