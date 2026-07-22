# Storage resolution (shared by every artifact-storing skill and agent)

Authoritative reference for how Cadence turns a slug into stored bytes and back. Any skill or agent that reads or writes a design, plan, or brainstorm stub follows this document; if a skill's own text ever describes storage differently, this doc wins. Sourced from [[../../docs/designs/2026-07-10-notion-mode/01-storage-abstraction]] (operations and contracts), [[../../docs/designs/2026-07-10-notion-mode/02-notion-data-model]] (property schema), [[../../docs/designs/2026-07-10-notion-mode/03-connection-provisioning]] (discovery, provisioning, auth), and [[../../docs/designs/2026-07-10-notion-mode/04-content-translation]] (block translation).

The layer defines a small set of abstract operations. Each operation has one contract and two implementations behind it, a filesystem backend and a notion backend; skills call the operation by name and stay backend-agnostic, and the branch on `storage.backend` happens inside this layer and nowhere else.

## The abstract operation set

Operations take an artifact type (`design` or `plan`) plus a slug; the type selects which path root or which database is in play, and mutating operations target the overview unless a slot is named. The table is the contract: anything not in it, a skill may not assume about storage.

| Operation | Inputs | Returns | Filesystem behavior | Notion behavior (one phrase) |
|---|---|---|---|---|
| `resolve(type, slug)` | artifact type, slug | location handle | maps slug to the `<paths.type>/<slug>/` folder | maps slug to the type's database row page id via a query |
| `artifact_exists(type, slug)` | type, slug | boolean | is there a folder with a `00-overview.md`? | is there a matching row in the type's database? |
| `create_artifact(type, slug, frontmatter)` | type, slug, overview frontmatter | location handle | make the folder, write `00-overview.md` with frontmatter | ensure Tags options exist (add-missing-first), then create a database row and set its title and initial properties |
| `read_artifact(type, slug)` | type, slug | overview and each child doc | read every `.md` in the folder | fetch the row's properties and child sub-pages, translate blocks back to markdown |
| `write_doc(type, slug, slot, content)` | type, slug, slot id, markdown body | nothing | write `<slot>.md` in the folder | translate obsidian syntax to Notion-flavored Markdown, upsert the slot's sub-page |
| `resolve_links(type, slug)` | type, slug | nothing | no-op (obsidian resolves wikilinks in the vault) | second pass after a batch write: rewrite `[[slug]]` wikilinks to `<mention-page>` mentions |
| `set_status(type, slug, status)` | type, slug, status value | nothing | set `status:` in the overview frontmatter | set the row's Status select property |
| `set_property(type, slug, key, value)` | type, slug, frontmatter key, value | nothing | set that key in the overview frontmatter | set the row's mapped typed property |
| `link(design_slug, plan_slug)` | design slug, plan slug | nothing | write `linked_plan:`/`linked_design:` on both overviews | set the design-to-plan Relation between the two rows |
| `tick(slug, task_ref)` | plan slug, checkbox reference | nothing | rewrite `- [ ]` to `- [x]` (or back, when clearing) at that reference | set the referenced to-do block's checked state |
| `query(type, status_filter)` | type, optional status filter | list of (slug, status, handle) | scan `<paths.type>/`, read overviews, filter | query the database with a Status filter |

## Per-operation contracts

**`resolve(type, slug)`** is the primitive every other operation builds on. It returns an opaque location handle, never a bare path or a raw page id, so a skill never holds a backend-specific address; it passes the handle back to other operations and never parses it. See [[#Slug as the stable handle]] for the handle's shape and each backend's lookup rule.

**`artifact_exists(type, slug)`** answers whether a slug already has an artifact, the check that gates create-versus-update decisions in `/c-brainstorm`, `/c-design`, and `/c-plan`. It never creates anything; a `false` result only tells the caller that `create_artifact` is safe to call next.

**`create_artifact(type, slug, frontmatter)`** is the only operation that brings an artifact into being, kept distinct from `write_doc` for that reason. On the filesystem it makes the folder and writes `00-overview.md` with the given frontmatter. On Notion it creates a database row and must set the row's title and its initial typed properties (status, created, updated, tags) in the same call, because a Notion row cannot exist without a title; there is no create-then-fill sequence. Before the create, the notion backend runs the Tags pre-step: fetch the target database's data-source schema, diff the frontmatter `tags` against the Tags property's existing option names (exact, case-sensitive match), and when any are missing add them via `notion-update-data-source` (add-only: pass names only so Notion assigns colors; never remove or recolor existing options). The official MCP hard-rejects unknown multi-select values, so skipping this step fails the create on any fresh tag. Operational sequence and payload shape: `skills/_shared/notion-translation.md`.

**`read_artifact(type, slug)`** returns a backend-neutral view: the overview's frontmatter and body, plus each child doc's slot id, frontmatter, and body. A caller that only needs the overview reads that entry and ignores the rest. This operation promises the shape of the return; the fidelity of Notion block-to-markdown reconstruction on read-back belongs to [[../../docs/designs/2026-07-10-notion-mode/04-content-translation]].

**`write_doc(type, slug, slot, content)`** replaces one slot's content wholesale. The filesystem writes `<slot>.md` in the artifact's folder; Notion translates the body's obsidian callouts and wikilinks to Notion-flavored Markdown (per `skills/_shared/notion-translation.md`) and hands the result to the official MCP, which creates the Notion blocks. Wikilinks resolve to mentions in the `resolve_links` second pass, not here. Partial edits are the caller's responsibility to assemble before the call; there is no append or patch form of this operation.

**`resolve_links(type, slug)`** runs only on the notion backend and only as the second pass of a batch write. Once all of an artifact's sub-pages exist (so the slug-to-page-URL map is complete), it rewrites each `[[slug#anchor]]` wikilink in the artifact's docs to a `<mention-page>` mention, degrading an unresolved target to readable text rather than literal `[[…]]`. It is idempotent, so it re-runs safely when a previously-missing cross-artifact target (a design's plan, say) later exists. On the filesystem backend it is a no-op: obsidian resolves wikilinks in the vault. The mapping and two-pass mechanics live in `skills/_shared/notion-translation.md`.

**`set_status(type, slug, status)`** is a vocabulary-checked specialization of `set_property` for the one field with a controlled vocabulary and transition rules (`skills/_shared/frontmatter.md`). It stays separate because the Notion backend maps status to a Select whose options must already exist in the schema, so an out-of-vocabulary value is an error this operation catches rather than a silent free-text write. Both backends bump `updated:` to today whenever `set_status` runs.

**`set_property(type, slug, key, value)`** covers the remaining overview fields a skill writes after creation, notably `base_sha` and `updated` on plans and `updated` on designs. The filesystem writes the frontmatter key directly; Notion writes the property it is mapped to. When the key is `tags`, the notion backend runs the same Tags pre-step as `create_artifact` before writing, since a post-create tag edit can introduce a new value just as easily.

**`link(design_slug, plan_slug)`** is bidirectional and idempotent: one call establishes the design-to-plan relationship from both sides. The filesystem writes two frontmatter fields, `linked_plan:` and `linked_design:`, one on each overview; Notion sets a single Relation, which Notion surfaces on both rows automatically. There is no half-linked state where one side points and the other does not.

**`tick(slug, task_ref)`** checks off a single task's checkbox and is the write `/c-execute` and `/c-validate` call most. `task_ref` is a stable reference to a specific checkbox within a plan doc, never a line number. The filesystem rewrites `- [ ]` to `- [x]` at that reference; Notion locates and flips the matching to-do block's checked state. How `task_ref` is shaped and matched to a Notion block is owned by [[../../docs/designs/2026-07-10-notion-mode/04-content-translation]]; this layer only fixes that `tick` is the verb and that it targets exactly one checkbox. `tick` also runs in the clearing direction — setting the checked state back to unchecked — which today has a single caller: `/c-validate`'s re-run reset (`validate.reset_checkboxes_on_rerun`).

**`query(type, status_filter)`** returns a type's artifacts, optionally filtered by status, for listing and roadmap-style reads. The filesystem scans `<paths.type>/`, reads each overview's frontmatter, and filters in memory; Notion runs a single database query with a Status filter, which is where boards and filtered views pay off.

## Slug as the stable handle

The slug (for example `2026-07-10-notion-mode`) is the one name skills and humans use to refer to an artifact, on both backends; no page id is ever typed or stored anywhere in Cadence. `resolve(type, slug)` is where the slug becomes a concrete location, and its return value, the location handle, is the only address a skill ever holds; the handle is opaque, passed back to other operations, and never parsed.

**Filesystem.** The slug maps directly and deterministically to `<paths.type>/<slug>/` (`paths.designs` or `paths.plans` from resolved config). This is pure path arithmetic on type, slug, and resolved config: no lookup, no state, exactly today's behavior.

**Notion.** The slug maps to a database row's page id by querying the type's database for the row whose Slug property matches the given slug; which property carries the slug, and why it is a stored property rather than the page title, is defined in [[../../docs/designs/2026-07-10-notion-mode/02-notion-data-model]]. The resolved page id is then carried inside the handle for the rest of the operation's work. The page id never appears in config, in frontmatter, or in a skill's text; the slug is the durable, committed, human-facing key, and the page id is a transient, resolved detail hidden behind `resolve`.

This asymmetry is the whole point of the layer: a skill says "the artifact `<slug>`" and gets correct behavior on either backend without knowing that one resolution is arithmetic and the other is a query.

## Backend selection

The layer reads `storage.backend` (`filesystem | notion`, default `filesystem`) from the resolved config (via `node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-config.js"`; contract in `skills/_shared/config-resolution.md`; never read config files directly). Selection is a single read at the top of any operation; there is no per-operation or per-artifact backend choice, and no operation branches on the backend a second time once selection has run.

The `filesystem` default is defined to equal today's Cadence behavior exactly, so a repo that never sets `storage.*` sees no change at all.

Because the backend is a whole-repo property the team shares, the entire `storage` block is team policy, not personal preference. Under `skills/_shared/config-resolution.md`'s rules, a local override of a `storage.*` key in `.cadence/config.local.yaml` is honored but surfaces a divergence notice rather than being accepted silently.

## The filesystem backend

The filesystem backend is not new code so much as a name for what Cadence skills already do: compute `<paths.type>/<slug>/`, read and write `.md` files inside that folder, edit the overview's frontmatter in place, and flip `- [ ]` checkboxes to `- [x]`. It is a named extraction of existing behavior, not new behavior.

When `storage.backend` is `filesystem`, the resolved behavior of every operation in [[#The abstract operation set]] is byte-for-byte what Cadence does today; nothing about how a repo reads or writes designs and plans on disk changes because this layer exists. Each operation's "Filesystem behavior" column in the table above IS this backend: there is no separate filesystem implementation to consult beyond what that column already states. Source: [[../../docs/designs/2026-07-10-notion-mode/01-storage-abstraction]].

## The notion backend

The notion backend drives the official Notion MCP (Notion's first-party MCP, https://developers.notion.com/guides/mcp/overview). Cadence ships no Notion client of its own and requires this specific MCP; it does not attempt to drive an arbitrary Notion integration.

### Locating and binding the official MCP

In `notion` mode, the storage layer binds each abstract operation to a tool on the official Notion MCP. Binding has three parts:

1. **Locate the official Notion MCP.** Enumerate the MCP tools exposed to the current session and identify the official Notion MCP by its stable tool surface: the `notion-*` tools (`notion-create-pages`, `notion-update-page`, `notion-fetch`, `notion-search`, `notion-query-data-sources`, `notion-create-database`) and its Notion-flavored Markdown content format. The per-install `mcp__<server-id>__` prefix differs per machine and is read from the live tool list; only the MCP's identity is fixed, not its address.
2. **Confirm the required tools are present.** Verify the located MCP exposes the primitives the storage layer needs (create page, create database, query or search, fetch, update page content and properties). A missing primitive is treated as "no usable Notion MCP" (see below), not worked around.
3. **Bind operations to tools.** Map each abstract operation in [[#The abstract operation set]] onto the official MCP's documented tool: `create_artifact` and new-sub-page `write_doc` via `notion-create-pages`; edits, `resolve_links`, and `tick` via `notion-update-page`; `read_artifact` via `notion-fetch`; `query` and `resolve` via `notion-query-data-sources`; database creation via `notion-create-database`.

Only the per-install server-id prefix is resolved at runtime; the tool identities are fixed because the MCP is fixed. No Notion server id is stored in config or frontmatter.

### Never fall back to the filesystem

When `storage.backend` is `notion` and the official Notion MCP is not present, or is present but missing a required primitive, the run hard-fails with an actionable message. The message states that Notion mode is enabled for this repo, that the official Notion MCP was not found in the session, and that the user must install it (https://developers.notion.com/guides/mcp/overview) and share `root_page` with its integration (see [[#The authentication boundary]]).

The notion backend never degrades to the filesystem backend under any circumstance. A silent fallback would put some artifacts in Notion and some on disk, splitting the source of truth the whole design exists to avoid; a stop the user can act on is strictly better than a quiet write to the wrong place.

Obsidian-to-Notion-flavored-Markdown translation on the way in, the read-back inverse, and wikilink resolution are specified operationally in `skills/_shared/notion-translation.md` and by design in [[../../docs/designs/2026-07-10-notion-mode/04-content-translation]]; the `tick` checkbox mechanics live there too. This layer fixes the operation contracts those implementations satisfy and does not restate the mapping.

## First-run provisioning

Provisioning runs from the notion branch of the storage layer before the first read or write of any Notion-mode operation, as a numbered flow:

1. **Resolve config.** Read `storage.backend`, `storage.notion.root_page`, `storage.notion.designs_db`, and `storage.notion.plans_db` from the resolver's output (`node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-config.js"`; contract in `skills/_shared/config-resolution.md`). If `backend` is not `notion`, provisioning does nothing.
2. **Short-circuit when already provisioned.** If both `designs_db` and `plans_db` are already set, the databases exist; skip straight to normal operation. This makes provisioning idempotent, a no-op on every run after the first.
3. **Search under the root page.** For each unset database id, search under `root_page` for an existing Designs or Plans database identified by a known title, using the discovered MCP's query or search capability. This recovers a database that exists but whose id was never recorded, for example one a teammate provisioned but has not yet committed.
4. **Create any still-missing database.** For a database that is neither in config nor found under the root page, create it under `root_page` with the property schema defined in [[../../docs/designs/2026-07-10-notion-mode/02-notion-data-model]].
5. **Write ids back to committed config.** Write the resolved and newly created database ids into `storage.notion.designs_db` and `storage.notion.plans_db` in the repo's committed `.cadence/config.yaml`, preserving surrounding content. This write-back edits the committed file additively and must never touch `.cadence/config.local.yaml`. This is a sanctioned write path per config-resolution.md; the read ban covers resolution only.
6. **Tell the user and remind them to commit.** Report which databases were found versus created, and remind the user to commit `.cadence/config.yaml` so the whole team shares the same databases and no one re-provisions.

## Schema ownership

Because Cadence creates the two databases with a schema it defines, that schema is Cadence's to own and evolve: a future change to the property set is a Cadence-driven database migration, not a user's hand-edit. This is distinct from `config_version` migration, which migrates keys inside the config file; a database-schema migration instead alters Notion database structure through the MCP. The reconciliation mechanism itself, detecting a provisioned database that predates the current schema and updating it, is deferred to future work; this doc fixes only the responsibility, that Cadence owns and migrates the schema. Source: [[../../docs/designs/2026-07-10-notion-mode/03-connection-provisioning]].

## The authentication boundary

Authentication is entirely the Notion MCP's concern: the MCP holds and refreshes whatever token or integration credential it uses, and Cadence stores and passes no Notion secret. The one user-side requirement is sharing `root_page` with the Notion MCP's integration, so the integration can read the page and create databases and sub-pages beneath it; Cadence cannot grant this access on the user's behalf.

When provisioning or a later operation fails because the integration lacks access to `root_page`, that surfaces as an MCP-level error, not a Cadence-level one, and the remedy is to share the root page (and its descendants) with the integration.
