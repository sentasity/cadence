# Config resolution (shared by every config-reading skill and agent)

Authoritative reference for how Cadence resolves configuration. Resolution is EXECUTED by `scripts/resolve-config.js`, shipped with the plugin; this document describes that script's contract. Any skill or agent that needs configuration invokes the script; none re-implements the algorithm below by hand. If a skill's own text ever reads differently, this doc wins.

## The sanctioned invocation (master copy)

Every config-reading skill embeds this block; its wording is canonical:

**Resolve config first** (the only sanctioned config read):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-config.js"
```

Use the `config` object from its JSON output; `--key <dot.path>` for a late
single-value read. Print one notice line per `team_policy_overrides` entry
(once per session per key). If `gitignore_missing` is true, add
`.cadence/config.local.yaml` to the repo's `.gitignore` and tell the user.
On ANY non-zero exit: stop, show the stderr message, and wait for the user.
Never read `.cadence/config.yaml`, `.cadence/config.local.yaml`, or
`defaults/config.default.yaml` directly, and never resolve config from
memory.

Resolve fresh at the start of every skill invocation (and inside any sub-agent that reads config itself); there is no session cache.

## The three layers

The script resolves every key by loading the layers in order; the **last layer that defines a key wins** for that key:

| Layer | File | Owner | Committed? |
|---|---|---|---|
| 1. Plugin defaults | `${CLAUDE_PLUGIN_ROOT}/defaults/config.default.yaml` | the plugin | ships with the plugin |
| 2. Repo config | `.cadence/config.yaml` | the team | repo's choice (either way) |
| 3. Local overrides | `.cadence/config.local.yaml` | the individual | **never** (gitignored) |

The script walks up from the invoking working directory until it finds a `.cadence/` directory containing at least one of the two repo-side files; both are read from that one directory. A missing layer is skipped: no `.cadence/` config anywhere means pure defaults (`root: null` in the output); no local file means defaults plus repo config. A `.cadence/` holding only a local file resolves as defaults plus local.

## Merge semantics: shallow, per key path, no cleverness

A key defined in a later layer **replaces** the earlier value at that key path. Scalars replace scalars; a list replaces the whole list (no element merging); a mapping contributes its defined child keys and leaves siblings from earlier layers intact; an explicit `null` counts as defined and wins. These are the semantics `scripts/resolve-config.js` executes and `scripts/resolve-config.test.js` locks down.

```yaml
# .cadence/config.local.yaml — sparse overrides only
execute:
  max_parallel: 2        # this laptop can't take 5
  worktree_confirm: false
authoring:
  design_mode: all-at-once
```

## Output shape

Stdout carries one JSON object:

- `config` — the fully merged tree. This is the only place skills read settings from.
- `root` — absolute path of the directory containing `.cadence/`, or `null`.
- `sources` — absolute path per layer (`defaults`, `repo`, `local`); `null` for absent layers.
- `team_policy_overrides` — one `{key, layer, value}` entry per team-policy key whose effective value came from the local layer.
- `gitignore_missing` — `true` when the local file exists and the repo's `.gitignore` content lacks a `.cadence/config.local.yaml` line.

With `--key <dot.path>`: strings, numbers, and booleans print raw; `null` prints `null`; mappings and lists print compact JSON; a missing path exits 4. `--key` output carries no provenance, so the divergence-notice duty belongs to the no-flag resolve at skill start.

## Exit codes and the hard stop

| Exit | Condition |
|---|---|
| 0 | Success, including pure-defaults resolution. |
| 2 | Plugin defaults missing (broken or stale plugin install). |
| 3 | YAML parse error in any layer (message names file and line). |
| 4 | `--key` path not found. |
| 5 | Usage error. |

Any non-zero exit — including `node: command not found` or `Cannot find module` from a pre-resolver plugin cache — halts the Cadence skill run. Surface the stderr message verbatim and wait for the user. There is no manual-resolution fallback: a wrong-but-plausible config is worse than a stopped run.

## The local file is sparse, versionless, and never migrated

- `config.local.yaml` contains **only** the keys being overridden. It is never seeded with defaults.
- It carries **no `config_version`** and `scripts/migrate-config.js` never reads, writes, or migrates it. A local override of a relocated key simply stops matching anything and falls silent (remove it).
- There is no user-global layer (`~/.claude`-level Cadence preferences). Repo-local is the only override surface.
- Gitignored files are not present in fresh worktree checkouts, so worktree provisioning copies `.cadence/config.local.yaml` from the main checkout into each new worktree when it exists (see `skills/_shared/worktree-lifecycle.md`). The resolver never walks past the first `.cadence/` match to compensate.

## Gitignore is mandatory

`.cadence/config.local.yaml` must be gitignored: a committed "local" file is just a second team config with a confusing name. The script checks the repo `.gitignore` content (NOT `git check-ignore`: a user's global excludes can pass on one machine while every other clone stays unprotected) and reports `gitignore_missing`; the invoking skill adds the line and tells the user. The script itself never writes anything.

## Personal keys vs team policy

The local layer exists for preferences that legitimately differ per person or per machine, not for opting out of team policy.

**Intended for local override:** `execute.max_parallel`, `execute.worktree_confirm`, `authoring.*`, `validate.browser_driver`, `validate.browser_command`, `validate.browser_env_preamble`, `advisors.*`.

**Team policy:** the `TEAM_POLICY_KEYS` constant in `scripts/resolve-config.js` is the source of truth; this list mirrors it. Prefix entries cover the subtree: `paths.*`, `naming.*`, `status.*`, `frontmatter.*`, `plan.*`, `audits.*`, `oos.*`, `worktree.hooks.*`; exact entries: `storage.backend`, `storage.notion.root_page`, `storage.notion.designs_db`, `storage.notion.plans_db`, `worktree.dir`, `worktree.integrate`, `worktree.merge_lock`, `worktree.lock_stale_threshold`, `execute.branch_check`, `execute.auto_resolve_drift`.

**Divergence notice, never a block:** the script reports each local override of a team-policy key in `team_policy_overrides`; the skill honors the value but prints one line, once per session per key, e.g. *"Note: `.cadence/config.local.yaml` overrides team-policy key `audits.default`."* The user is in control; the notice just keeps the divergence from being silent.

## Sanctioned write paths

The read ban does not cover writes. These sites legitimately touch config files directly and stay as they are: `/c-brainstorm`'s fresh-repo scaffolding (creates `.cadence/config.yaml`), Notion first-run provisioning (writes database ids back into `.cadence/config.yaml`), the `gitignore_missing` add-if-absent edit, and `scripts/migrate-config.js` (reads and rewrites `config.yaml` as the migration tool).
