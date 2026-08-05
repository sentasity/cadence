---
name: c-worktree
description: Full git-worktree lifecycle for isolated interactive sessions — create an isolated worktree, optionally run its dev server on a dedicated port, ship the branch home by local merge or by GitHub PR, and clean up. Generic and standalone: works in any git repo with no Cadence design, plan, or other /c-* skill; local merges are lock-guarded so they serialize with /c-execute lane landings and other sessions; the PR-flow exit pushes the branch, opens the PR, and cleans up after it merges. Use whenever starting isolated or parallel feature work, spinning up a worktree, asking which port a worktree's dev server runs on, merging/integrating a worktree branch back to its base, or shipping one as a PR — from the feature session OR from the main worktree. Use it even when the user just says 'new worktree', 'isolate this', 'merge my branch back', 'push this up and open a PR', or 'the PR merged, clean up'.
---

# `/c-worktree`

You own the whole arc of an interactive worktree session: **create → run dev
server → go home through one of two exits (local merge or PR flow) → clean up**,
plus a deploy guard where a repo configures one. Generic where it can be (plain
git plus a merge lock that works in any repo) and repo-aware only through
optional config hooks. Pick the phase that matches the request — you rarely run
all of them in one turn.

## Invocation

- `/c-worktree` or `/c-worktree create [<branch>]` — create an isolated worktree
  (always asks for the base branch).
- `/c-worktree merge [<feature>]` — the **local-merge exit**: merge a feature
  branch home in this clone, lock-guarded. From a feature worktree with no arg,
  the current branch merges to its recorded parent; from the target worktree,
  `<feature>` merges into the current branch. When the branch's base is the
  repo's PR target, this first routes through the exit choice (see Two exits).
- `/c-worktree pr [<feature>]` — the **PR-flow exit**: push the branch and open
  a PR against its recorded parent; the worktree stays alive for review fixes,
  and cleanup runs after the PR merges.
- `/c-worktree cleanup [<feature>]` — stop the dev server, remove the worktree,
  delete the branch, release the port. Detects a PR-shipped branch and verifies
  the PR merged first.

Bare phrasing maps to phases too: "new worktree" → create; "merge my branch
back" / "I'm done, ship it" → the exit choice (see Two exits); "push this up" /
"open a PR for this" → pr; "tear down this worktree" / "the PR merged, clean
up" → cleanup.

## The standalone-generic guarantee

`/c-worktree` requires **no Cadence design, no plan, and no other `/c-*` skill**
at runtime. It works in any git repo. With an empty or absent `worktree:` config
(or no `.cadence/config.yaml` at all), only the generic core runs: plain
`git worktree add`, a lock-guarded merge or a push + PR, and cleanup. The
`references/merging.md` menu and the merge lock (`scripts/merge-lock.sh` at the
plugin root) are the only non-trivial generic pieces. The PR-flow exit is
generic too: it needs a remote base (plus `gh` for the nicest path) and
degrades to push + a hand-opened PR when `gh` is absent.

## Config

Read the `worktree:` section from the resolved config: run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-config.js"` and use its JSON
`config.worktree` (contract in `skills/_shared/config-resolution.md`; a repo
with no config file gets pure defaults; never read config files directly):

| Key | Default | Meaning |
|---|---|---|
| `worktree.dir` | `.cadence/worktrees` | where worktrees live |
| `worktree.integrate` | `rebase-ff` | integrate policy (`rebase-ff` \| `merge-commit`); sets the merge menu's recommended option |
| `worktree.merge_lock` | `true` | acquire the shared merge lock around the merge's git operations |
| `worktree.lock_stale_threshold` | `600` | seconds before a held lock surfaces "steal it?" (never auto-steal) |
| `worktree.hooks.*` | all `null` | the six optional repo hooks (`provision`, `provision_verify`, `port_assign`, `port_release`, `dev_server`, `deploy_guard`) |

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
- **Working directory:** `provision`, `provision_verify`, `port_assign`, and
  `dev_server` run with cwd = `$WT_PATH`. `port_release` runs with cwd =
  `$MAIN_ROOT` (the worktree may already be removed). `deploy_guard` runs in the
  directory the deploy was attempted from (that location is what it judges).
- **Stdout:** only `port_assign`'s stdout is contract-bearing (the assigned
  port). Other hooks' output is informational and surfaced to the user.
  `provision`'s stderr is **always** surfaced at create time, even on a zero
  exit, so a best-effort provisioner's `WARNING:` lines are visible immediately
  instead of at the first push.
- **Non-zero exit:** `provision` failure → surface it and offer to remove the
  half-created worktree (never leave one silently broken). `provision_verify`
  failure → surface its output and offer the user **repair** (re-run `provision`,
  which a self-healing provisioner rebuilds from, then re-run `provision_verify`),
  **remove** (tear the worktree down), or **keep** (proceed as-is, warned).
  `port_assign` failure → surface it and continue without a port (the dev-server
  phase is then unavailable). `dev_server` failure → surface it. `port_release`
  failure → surface it but continue cleanup. `deploy_guard` failure → refuse the
  deploy and explain the merge-first-then-deploy-from-main flow.

## Create phase

1. **Detect existing isolation first.** Don't nest worktrees.
   ```bash
   GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P)
   GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
   ```
   If they differ (and `git rev-parse --show-superproject-working-tree` is empty,
   i.e. not a submodule), you're already in a linked worktree — **refuse to
   nest**: say so and stop the create. Work here instead, or run the merge or
   cleanup phases; never create a worktree from inside one.
2. **Choose the base branch — ask, never assume.** A worktree branches off some
   base; pick the wrong one and you silently build the feature on the wrong code.
   Do NOT decide this on your own.
   - **If the user already named a base** (in their request, as `BASE=…`, or e.g.
     "new worktree off `develop`"), honor it — no question needed.
   - **Otherwise gather the candidates and ask.** Two almost always matter; find
     them, don't guess:
     - the **integration branch** — where features go home before release: the
       repo's documented flow (CLAUDE.md / CONTRIBUTING), else the remote HEAD
       (`git symbolic-ref --short refs/remotes/origin/HEAD` → strip `origin/`),
       else `git config --get init.defaultBranch`.
     - the **current branch** — `git rev-parse --abbrev-ref HEAD`.
   - **Recommend one, then ask with `AskUserQuestion`** (single-select; the hard
     gate in `skills/_shared/ask-user-question.md` applies). Default
     recommendation is the integration branch — fresh, isolated work that merges
     back there. Recommend the **current branch** instead when either holds:
     - the new work depends on un-merged commits that live on it, or
     - **the current branch's name reads as related to the intended work** — i.e.
       the new task looks like a continuation or sub-task of what that branch is
       already for (e.g. on `alerts-platform`, asked to "add the alert-rule
       editor"). A shared topic/prefix is a strong signal; the bare integration
       branch name (`develop`/`main`) never counts.

     Either way, say *why* in that option's description so the user can judge the
     call. Put the recommended option first, suffixed `(Recommended)`, and include
     both candidates (plus any other live local branch that's a plausible base).
     The user can always type their own via "Other".
   - The branch the user picks is `<base>` below.
3. **Create off the chosen base.** `<branch>` is the user-named branch, or a
   short kebab-case name you propose from the task (confirm it before creating):
   ```bash
   git worktree add -b <branch> <worktree.dir>/<branch> <base>
   ```
4. **Record the integration target** so both exits know where this branch goes
   home: `git config branch.<branch>.parent <base>`.
5. **Gitignore the worktree home.** Add the `<worktree.dir>/` line to the repo's
   `.gitignore` if it is absent (same behavior as `/c-execute` lanes).
6. **Run the create hooks (each only when set).** First `provision` (cwd
   `$WT_PATH`); on non-zero exit, surface it and offer to remove the half-created
   worktree. Always surface `provision`'s stderr at this point, even on a zero
   exit, so a best-effort provisioner's warnings are visible now rather than at
   first push. Then `provision_verify` (cwd `$WT_PATH`): it asserts the
   provisioned environment is actually usable, independent of `provision`'s exit
   code. On non-zero, surface its output and offer **repair** (re-run
   `provision`, then re-run `provision_verify`), **remove** (tear the worktree
   down), or **keep** (proceed as-is, warned); it runs before `port_assign` so a
   broken environment is caught before a port is allocated. Then `port_assign`
   (cwd `$WT_PATH`); capture its stdout as the assigned port and persist it:
   ```bash
   git config branch.<branch>.devPort <port>
   ```
   so cleanup — possibly in a different session — can find the port without
   repo-specific files. On `port_assign` failure, surface it and continue without
   a port (the dev-server phase is then unavailable).

## Dev-server phase

**Absent unless the `dev_server` hook is set.** With a null hook this phase does
not exist — do not improvise a server or guess at an `npm run dev`.

When set:

1. Resolve the port: the `port_assign` stdout captured at create, or read it back
   with `git config branch.<branch>.devPort`. No port recorded → this phase is
   unavailable; say so (re-running `port_assign` is the fix, never guessing a
   port).
2. Run the `dev_server` hook in the worktree (cwd `$WT_PATH`) with `DEV_PORT`
   exported alongside the standard hook env. It is long-running — run it in the
   background and tell the user where it listens (`http://localhost:$DEV_PORT`).
3. On non-zero exit, surface the failure and the hook's output.
4. Never hardcode or assume port 3000 — that belongs to the main worktree.

Stop the server when the user is done with it, and **always** before cleanup.
Kill by the worktree's own recorded port (see the cleanup phase), never `:3000`.

## Two exits: local merge or PR flow

A finished worktree branch goes home through exactly one of two exits. Always
name the exit in what you say to the user; "merge it back" has meant both, and
taking the wrong one is the failure this section exists to prevent.

- **Local merge** (`/c-worktree merge`, next section): the branch merges into
  its base in this clone, behind the shared merge lock. Integration is complete
  the moment the merge lands. Right when the base is a local integration point:
  an epic/integration branch, or a repo that doesn't ship through PRs.
- **PR flow** (`/c-worktree pr`, section after): the branch is pushed and a PR
  is opened against its base; integration happens on the remote (review, then
  the forge's merge). The local base is untouched until cleanup pulls the
  merged result down. Right when the base is the repo's PR target (e.g.
  `develop`): a local merge there would put unreviewed commits on the local
  base and diverge it from `origin/<base>`; the PR is the real integration.

**Choosing the exit:**

1. **The user named it**: `/c-worktree pr`, "open a PR", "push this up" → PR
   flow; "merge it locally", "merge into the epic branch here" → local merge.
   No question either way.
2. **PR flow impossible** (no remote, or no `origin/<base>`): local merge, no
   question.
3. **Otherwise check for the PR-flow signature:** `<base>` is the repo's
   PR-receiving integration branch (same discovery as the create phase:
   documented flow in CONTRIBUTING/CLAUDE.md, else the remote HEAD) and it
   tracks origin. A worktree branched off an epic branch does NOT match, even
   when the epic is pushed: the epic integrates locally and ships as a PR
   later, as a whole.
4. **Signature holds → ask; otherwise local merge.** Ask with `AskUserQuestion`
   (the `skills/_shared/ask-user-question.md` spec applies), recommending **PR
   flow**, with the divergence hazard above as the why in that option's
   description. This question fires even on a bare `/c-worktree merge` or
   "merge my branch back": that is the phrase users reach for when they mean
   "ship it", so against the PR target it gets the question, never a silent
   local merge. If the user picks local merge anyway, honor it.

## Local-merge exit

All local merges serialize through one repo-global lock — `scripts/merge-lock.sh` at
the plugin root, invoked as `"${CLAUDE_PLUGIN_ROOT}/scripts/merge-lock.sh"`. It
is the same lock `/c-execute` takes around its lane landings, so an interactive
merge and an autonomous land can never collide. The lock is one per repo, not per
branch: merges into different branches also take turns (accepted over-caution;
merges are short). **Read `references/merging.md` before merging** — it has the
squash / merge-commit / fast-forward menu, conflict handling, branch deletion,
and the topology edge cases.

**Resolve source + target:**

- *From a feature worktree, no branch arg (usual):* source = current branch;
  target = its `branch.<branch>.parent` (fallback: the branch checked out in the
  main worktree). `cd "$MAIN_ROOT"` first — the merge mutates the main worktree.
- *From the main/target worktree with `/c-worktree merge <feature>`:* source =
  `<feature>`; target = current branch; operate in place.

**All interaction happens BEFORE the lock.** Gather every decision first, so the
lock is held only for the git operations and an interactive holder never sits on
it while a human deliberates:

1. Show what will move (`references/merging.md` §1 — both sides of the
   merge-base).
2. Ask the merge-type menu (`references/merging.md` §2). The recommended option
   comes from `worktree.integrate`: `rebase-ff` → fast-forward (rebase the source
   onto the target first if history isn't linear); `merge-commit` → merge commit.
3. Only when the user has answered, acquire the lock.

**Acquire** (when `worktree.merge_lock: false`, skip acquire and release and run
the merge unlocked):

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/merge-lock.sh" acquire --target <target> --threshold <worktree.lock_stale_threshold>
```

| Result | Response |
|---|---|
| `ACQUIRED` | Proceed. |
| `WAITING holder=<b> age=<n>s` | Another merge is in flight; re-run acquire (it polls and returns under the Bash tool timeout). |
| `STALE holder=<b> age=<n>s` | **Stop and ask the user — never auto-steal.** The prompt must include everything `holder.json` knows — holder branch, holder worktree path, and age (read `$(git rev-parse --git-common-dir)/worktree-merge.lock/holder.json`) — so the user can check whether the holder is genuinely dead before answering. On an explicit yes: `"${CLAUDE_PLUGIN_ROOT}/scripts/merge-lock.sh" steal --target <target>`. On no: wait or abort. |

**Under the lock:**

4. In the **target worktree**, confirm it's clean and on `<target>`. If it's
   dirty or on a different branch, surface it — never auto-stash, never
   auto-switch (it may hold a human's dev server or in-progress state).
5. Run the chosen merge (`references/merging.md`). **Conflicts are surfaced,
   never auto-resolved.** Conflict resolution requires user input while the lock
   is held — that's unavoidable; see the note below.
6. Release: `"${CLAUDE_PLUGIN_ROOT}/scripts/merge-lock.sh" release`.

Cleanup (its own phase, below) happens outside the lock.

### Stale threshold vs interactive holds

The "merges are short, a long-held lock almost always means a dead holder"
rationale was written for autonomous merges. Interactive merges make long *live*
holds possible: a human resolving conflicts can legitimately exceed
`worktree.lock_stale_threshold`. Two mitigations are designed in: the
ask-before-acquire ordering above keeps the deliberation window out of the hold
entirely, and the holder-info-rich steal prompt lets the other party verify
before stealing. So when YOUR hold runs long during conflict resolution, expect
other sessions to be shown the steal prompt; and when YOU see `STALE`, remember
the holder may be a live human mid-conflict — which is exactly why you never
steal without the user's explicit yes.

## PR-flow exit

Ship the worktree branch as a PR against its base. **No merge lock at any
point:** the lock serializes local integrations into this clone's checkouts,
and PR flow performs none (the forge serializes merges on its side).

**Resolve source + base** as the local-merge exit does: source = the current
branch (or the named `<feature>`); base = its `branch.<branch>.parent`
(fallback: the integration branch). Then:

1. **Show what will ship.** `git fetch origin`, then
   `git log --oneline origin/<base>..<branch>` (the PR's commit list). Confirm
   the feature worktree is clean: uncommitted work doesn't ship, so surface it
   and let the user decide (commit it or leave it behind; never auto-stash).
2. **Offer pre-PR dev validation on the main checkout.** In PR flow, "validate
   on the main checkout" happens BEFORE the PR merges, not after a merge-back.
   In `$MAIN_ROOT` (confirm it's clean; never auto-stash, never interrupt a
   live dev server without saying so), run `git checkout --detach <branch>` (a
   plain checkout refuses while the branch is checked out in the feature
   worktree; detaching sidesteps that without touching it), validate with the
   main checkout's tooling, then return with `git checkout <prior-branch>`.
   Skip freely: this matters mostly in repos whose dev or deploy tooling is
   anchored to the main checkout.
3. **Push:** `git push -u origin <branch>`.
4. **Open the PR** with base `<base>`. Draft a title and body from the branch's
   commits (match the repo's PR conventions), show both, and create on the
   user's confirmation: `gh pr create --base <base> ...`. No `gh`, or not a
   GitHub remote: push anyway and hand the user the create-PR URL (git prints
   one on push) to open it themselves.
5. **The worktree outlives the PR.** Review fixes happen here and push to the
   same branch; the PR updates itself. Never clean up while the PR is open.
6. **After the PR merges** (the user says so, or `MERGED` per
   `gh pr view <branch> --json state`): run the cleanup phase. Its PR-shipped
   variant verifies the merge before deleting the squashed branch, and
   finishes by syncing the base.

The deploy guard is unchanged by this exit: deploys happen from the main
worktree only, after the PR has merged and the base is synced (cleanup's last
step): never from the feature worktree, and never from the pre-PR validation
checkout.

## Cleanup phase

Run after a local merge lands (outside the lock), after a shipped PR merges, or
on request for an abandoned worktree.

**PR-shipped branch? Verify the merge before touching anything.** If this
branch went out through the PR-flow exit, confirm the PR merged (state
`MERGED` per `gh pr view <branch> --json state,mergedAt`; without `gh`, fetch
and find the squash commit on `origin/<base>`, or the user confirms) BEFORE
step 1: an OPEN PR means cleanup is premature (the worktree is where review
fixes happen), so stop and confirm intent first. Step 3 relies on this
verification.

1. **Stop the dev server first** — otherwise it lingers (RAM + a held port) and
   its cwd is about to be deleted. Kill by the worktree's **own** recorded port,
   never `:3000`:
   ```bash
   port="$(git config branch.<branch>.devPort 2>/dev/null || true)"
   if [ -n "$port" ]; then pids="$(lsof -ti tcp:"$port" 2>/dev/null)"; [ -n "$pids" ] && kill $pids; fi
   ```
2. **Remove the worktree:** `git worktree remove <worktree.dir>/<branch>` — from
   outside the directory being removed (see the topology notes in
   `references/merging.md`).
3. **Delete the branch:** `git branch -d <branch>` — or `-D` only after the user
   confirmed a squash captured everything (`references/merging.md` §4). If `-d`
   refuses after a clean merge because the current HEAD doesn't contain the
   target's new commits, briefly check out `<target>` and delete from there
   (merged-check anchors to HEAD); that is not a `-D` case.
   **PR-shipped branch:** a squash-merged PR leaves nothing `-d` can see, and
   the forge answers the "did the squash capture everything" question instead
   of the user: the merge was already verified before step 1, so go straight
   to `git branch -D <branch>`. Delete the remote branch too if the forge
   didn't (`git push origin --delete <branch>`; already gone counts as
   success, not an error).
4. **Run the `port_release` hook** if set (cwd `$MAIN_ROOT` — the worktree is
   already gone).
5. **Unset the branch config:**
   ```bash
   git config --unset branch.<branch>.parent  2>/dev/null || true
   git config --unset branch.<branch>.devPort 2>/dev/null || true
   ```
6. **PR flow only: sync the base.** The merged PR lives on `origin/<base>`
   until it's pulled: if the main worktree has `<base>` checked out, run
   `git pull --ff-only origin <base>` there; otherwise
   `git fetch origin <base>:<base>`. Both refuse a non-fast-forward. A refusal
   means local `<base>` has diverged from origin (often exactly the unreviewed
   local commits the PR-flow exit exists to avoid): surface it, never force.

## Deploy phase

**Absent unless the `deploy_guard` hook is set** — the plugin owns no deploy
logic, and **this skill never deploys** either way.

When the hook is set and a deploy is requested from a worktree context: run
`deploy_guard` (cwd = the directory the deploy was attempted from; that location
is what it judges). On non-zero exit, **refuse the deploy** and explain the flow:
get the feature home first (local-merge exit, or in PR flow a merged PR plus
cleanup's base sync), then deploy from the main worktree.
A repo's guard may also fire inside its own build targets independently of this
skill; the hook is then a second line of defense plus a better explanation, not
the enforcement.

## What `/c-worktree` doesn't do

- Doesn't deploy — ever. `deploy_guard` only judges and refuses.
- Doesn't approve or merge its own PR: PR integration belongs to the repo's
  review flow. This skill pushes, opens the PR, and cleans up after it merges.
- Doesn't auto-steal a stale lock, auto-resolve conflicts, or auto-stash /
  auto-switch the target worktree.
- Doesn't touch `/c-execute`'s lane worktrees (`cadence/lane-*`) — those belong
  to the execution engine, even when they share `worktree.dir`.
- Doesn't require any Cadence design, plan, or other `/c-*` skill.

## References

- **Shared lifecycle authority: `skills/_shared/worktree-lifecycle.md`** —
  naming, the lock as a shared step, the config hook points, the lock's
  `--wait-budget` default, and the `cadence/lane-*`-only prune scoping both
  skills honor. If this skill and that doc ever read differently, the shared doc
  wins.
- Merge mechanics: `references/merging.md`.
- Design source: [[designs/2026-06-09-c-worktree/03-c-worktree-skill]].
