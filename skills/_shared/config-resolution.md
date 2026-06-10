# Config resolution (shared by every config-reading skill and agent)

Authoritative reference for how Cadence resolves configuration. Any skill or agent that reads Cadence config follows this document; if a skill's own text ever reads differently, this doc wins.

## The three layers

Resolve every key by reading the layers in order; the **last layer that defines a key wins** for that key:

| Layer | File | Owner | Committed? |
|---|---|---|---|
| 1. Plugin defaults | `${CLAUDE_PLUGIN_ROOT}/defaults/config.default.yaml` | the plugin | ships with the plugin |
| 2. Repo config | `.cadence/config.yaml` | the team | repo's choice (either way) |
| 3. Local overrides | `.cadence/config.local.yaml` | the individual | **never** (gitignored) |

Both repo files are found by walking up from the current working directory (the same walk skills already do for `.cadence/config.yaml`); the local file is only ever read from the same `.cadence/` directory as the repo config it overrides. A missing layer is simply skipped: no `.cadence/` config at all means pure defaults; no local file means defaults plus repo config, which is exactly today's behavior.

## Merge semantics: shallow, per key path, no cleverness

A key defined in a later layer **replaces** the earlier value at that key path. Scalars replace scalars; a list replaces the whole list (no element merging); a mapping contributes its defined child keys and leaves siblings from earlier layers intact. This is the same additive-by-key-path model `scripts/migrate-config.js` already uses between layers 1 and 2.

```yaml
# .cadence/config.local.yaml — sparse overrides only
execute:
  max_parallel: 2        # this laptop can't take 5
  worktree_confirm: false
authoring:
  design_mode: all-at-once
```

## The local file is sparse, versionless, and never migrated

- `config.local.yaml` contains **only** the keys being overridden. It is never seeded with defaults.
- It carries **no `config_version`** and `scripts/migrate-config.js` never reads, writes, or migrates it. Schema migration is the repo config's concern; a local override of a relocated key simply stops matching anything and falls silent (remove it).
- There is no user-global layer (`~/.claude`-level Cadence preferences). Repo-local is the only override surface.

## Gitignore is mandatory

`.cadence/config.local.yaml` must be gitignored: a committed "local" file is just a second team config with a confusing name. When a skill resolves config and finds the local file present but the **repo's `.gitignore` lacks a `.cadence/config.local.yaml` line**, add the line and tell the user (same add-if-absent behavior as `worktree.dir`). Check the `.gitignore` content, NOT `git check-ignore`: a user's global excludes file can make `check-ignore` pass on their machine while every other clone of the repo stays unprotected, and the repo line is the protection that travels.

## Personal keys vs team policy

The local layer exists for preferences that legitimately differ per person or per machine, not for opting out of team policy.

**Intended for local override:** `execute.max_parallel`, `execute.worktree_confirm`, `authoring.max_parallel`, `authoring.design_mode`, `validate.browser_driver`, `validate.browser_command`, `validate.browser_env_preamble`, `advisors.*`.

**Team policy (overriding locally is silent drift):** `paths.*`, `naming.*`, `status.*`, `frontmatter.*`, `plan.*`, `audits.*`, `oos.*`, `worktree.integrate`, `worktree.merge_lock`, `worktree.lock_stale_threshold`, `worktree.hooks.*`, `worktree.dir`, `execute.branch_check`, `execute.auto_resolve_drift`.

**Divergence notice, never a block:** when resolution finds a local override of a team-policy key, honor it but print one line, once per session per key, e.g. *"Note: `.cadence/config.local.yaml` overrides team-policy key `audits.default`."* The user is in control; the notice just keeps the divergence from being silent.
