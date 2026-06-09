# Merging a worktree branch home

Detailed mechanics for the merge phase. The lock (`scripts/merge-lock.sh` at the
plugin root, invoked as `"${CLAUDE_PLUGIN_ROOT}/scripts/merge-lock.sh"`) is already
covered in SKILL.md; this file is the merge itself.

## 1. Show what will move

```bash
base=$(git merge-base HEAD <source>)
git log --oneline "$base"..HEAD       # commits already on the target
git log --oneline "$base"..<source>   # commits the source will bring in
```
Present both sides so the user sees the shape of the merge.

## 2. Choose the merge type

Detect fast-forward eligibility first:
```bash
git merge-base --is-ancestor HEAD <source> && echo "ff possible" || echo "ff not possible"
```

Ask (unless a flag was given):

> How should I merge `<source>` into `<target>`?
> 1. **Squash** — collapse N commits into one new commit on `<target>`
> 2. **Merge commit** — preserve history with a `--no-ff` merge commit
> 3. **Fast-forward** — only if linear (fails otherwise)

The recommended option comes from `worktree.integrate` (see SKILL.md): `rebase-ff`
recommends fast-forward, `merge-commit` recommends the merge commit.

Then run the chosen one:
- Squash: `git merge --squash <source>` then `git commit` (offer a custom message).
- Merge commit: `git merge --no-ff <source> -m "Merge <source> into <target>"`.
- Fast-forward: `git merge --ff-only <source>` (if it fails, re-ask for a non-ff option).

## 3. Conflicts

Show the conflicting files and their content; ask the user how to proceed. **Never
resolve conflicts without confirmation.** Once approved, resolve and complete the
merge.

## 4. Branch deletion after cleanup

- Fast-forward / merge commit: `git branch -d <source>` (git sees it as merged).
- **Squash:** `git branch -d` fails (git can't see the squashed commits as
  reachable). Confirm with the user that the squash commit contains everything,
  then `git branch -D <source>`.

## Topology edge cases

- **Feature-session topology:** you started in the feature worktree. After
  `cd "$MAIN_ROOT"`, your cwd is the main worktree, so `git worktree remove
  <feature-path>` is safe (you're not standing inside the dir being removed).
- **Main-session topology (`/c-worktree merge <feature>`):** cwd is already the target
  worktree, also outside the feature worktree — same safety.
- Either way, the lock guards the integration worktree against a merge started the
  other way at the same time.
