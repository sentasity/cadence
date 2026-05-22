# Obsidian format conventions (shared by /c-design, /c-plan)

Authoritative reference for the obsidian-flavored markdown conventions Cadence's design and plan skills use. Sourced from [[designs/2026-05-17-cadence/02-design#Callout conventions]] and [[designs/2026-05-17-cadence/02-design#Folder layout]].

## Callouts (fixed set — no inventions)

| Callout | Use |
|---|---|
| `> [!summary] Plain English` | First block of every H2 in a technical child design doc. 2-4 sentences explaining what the section covers in non-technical terms. |
| `> [!success] Decision` | A resolved design question. Include rationale. |
| `> [!warning]` | A constraint, risk, or tradeoff the reader needs to know. |
| `> [!note]` | Context or explanation that doesn't fit elsewhere. |
| `> [!bug] Fix:` | An existing issue surfaced during design. Implies plan work. |
| `> [!todo] Build:` | Implementation work the plan will need to schedule. |

If a sentence doesn't earn a callout, it's just prose. No `> [!info]` flooding.

## Wikilinks

Relative format: `[[../sibling-folder/00-overview]]` or `[[01-topic#Section heading]]`. Resolves within the obsidian vault. Never use absolute paths.

## Reserved file slots

**Design folder:** `00-overview`, `00a-plain-english`, `97-infrastructure-inventory`, `98-architecture-diagrams`, `99-out-of-scope`.

**Plan folder:** `00-overview`, `96-validation`, `97-infrastructure-inventory` (shell), `98-architecture-diagrams` (shell), `99-out-of-scope`.

Skills refuse to scaffold conflicting names.

## Naming

- **Folder:** `yyyy-mm-dd-{kebab-slug}/`. Date format from `config.naming.date_format`.
- **Children:** `NN-{kebab-slug}.md`, zero-padded NN.

## Plain-English layering

- Every H2 section in a technical child doc opens with `> [!summary] Plain English` (2-4 sentences).
- Subsections (H3/H4) stay pure technical. No callout flooding at lower heading levels.
- The full plain-English narrative lives in `00a-plain-english.md` (written last in `/c-design`'s flow).

## Plan task fields (shared by /c-plan, /c-execute)

Every plan task block declares three list fields. They replace the old single `Files:` line and the `Parallel:` marker.

| Field | Meaning |
|---|---|
| `Reads:` | Files loaded into the implementer's context for reference; read, not written. |
| `Touches:` | Every file the task creates, modifies, or deletes. Drives `/c-execute`'s file-conflict guard. |
| `Depends:` | Task ids (e.g. `1.3`, `2.1`; cross-file allowed) that must merge before this task is ready. `[]` = independent. |

`Touches:` must name **every** file the task writes — `/c-execute` co-schedules tasks only when their `Touches:` sets are disjoint, so an understated list is a correctness bug, not just a missing-context cost. The retired `Parallel:` marker's meaning is now derived: a task is parallel-safe with another when there is no `Depends:` path between them and their `Touches:` sets are disjoint.
