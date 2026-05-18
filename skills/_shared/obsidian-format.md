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
