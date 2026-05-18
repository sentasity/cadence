---
name: c-design
description: Takes a `00-overview.md` stub from /c-brainstorm and materializes the full design folder (child docs in reading order, plain-English narrative, optional 97/98 sections, OOS shell). Sequential writes with explicit user review between each child doc. Self-review pass before flipping status to `in-review`. Never writes plans or code.
---

# `/c-design`

You materialize a design folder from the `00-overview.md` stub. You write one child doc at a time, pause for user review, and loop back to amend the overview if a child doc surfaces inconsistencies.

## Entry contract

**Requires:** `<paths.designs>/{yyyy-mm-dd-slug}/00-overview.md` exists with `status: draft` and a populated Doc index.

**Refuses when:** overview missing, status ≠ draft, empty doc index, or the stub carries an "Open questions" block (Invariant 1 violation — stub was written prematurely).

## Folder layout (every design)

```
<paths.designs>/
  {yyyy-mm-dd-slug}/
    00-overview.md
    00a-plain-english.md
    01-<topic>.md, 02-…
    97-infrastructure-inventory.md   # opt-in
    98-architecture-diagrams.md      # opt-in
    99-out-of-scope.md
```

Reserved slots: 00-overview, 00a-plain-english, 97-infrastructure-inventory, 98-architecture-diagrams, 99-out-of-scope. Refuse to scaffold conflicting names.

## Frontmatter

See `skills/_shared/frontmatter.md`. Design overview carries lifecycle; child docs carry only `title:`.

## Writing flow

1. **Read the stub.** List the proposed doc index. Confirm with user: *"Write `00a-plain-english.md` next, then `01-<x>`, `02-<y>`. Sound right?"*
2. **Write one child doc at a time.** Every H2 section opens with a `> [!summary] Plain English` callout (2-4 sentences). Subsections (H3/H4) stay pure technical. No padding paragraphs.
3. **Pause after each.** *"`<filename>` written. Review and tell me to continue, revise, or stop."* Never auto-write the next file.
4. **Invariant 2 — consistency re-litigation.** While drafting any child doc, if a question surfaces that contradicts or refines a decision in the overview or sibling, STOP writing. Surface the conflict. Ask the user to resolve. On resolution: amend overview's decisions log, amend affected siblings, update `updated:` on overview, then resume.
5. **OOS additions during design.** Any decision-not-to-do lands in `99-out-of-scope.md` immediately with rationale + wikilink. Never deferred.
6. **`00a-plain-english.md` is written last.** Sections (in order): What this feature does in one paragraph → The normal cycle → What the user sees → What can go wrong → How we'll know it's working → Lifecycle diagram → TL;DR. Length target: 400-700 lines for complex designs.
7. **97 / 98.** Filled when the doc index includes them. 97 lists every piece of infra (existing + new), one line each, citing files/services. 98 holds dense mermaid diagrams; lighter narrative diagrams live in 00a per convention.
8. **Self-review pass** (see below). Run a final pass on the whole folder.
9. **Flip status to `in-review`.** Update `updated:`. Print: *"Design ready for review. Walk through it and tell me when to mark it `approved`."*
10. **Status `approved`.** User-driven only. User says "approved" → flip status → print: *"Run `/c-plan` to write the implementation plan."*

## Callout conventions

See `skills/_shared/obsidian-format.md` for the full set. Summary: `> [!summary] Plain English` (per H2), `> [!success] Decision`, `> [!warning]`, `> [!note]`, `> [!bug] Fix:`, `> [!todo] Build:`. No invented callouts. No `> [!info]` flooding.

## Self-review pass (before flipping to in-review)

1. **Placeholder scan** — no `TBD`, `TODO`, `(fill in)`, empty H2s, `TBC` anywhere.
2. **Wikilink integrity** — every `[[…]]` resolves.
3. **Decisions consistency** — every overview decisions-log entry is reflected in dependent children; no contradictions.
4. **OOS integrity** — every 99-OOS entry has rationale + wikilink.
5. **Invariant 1 audit** — no callouts that read like open questions ("should we…", "we might…", "TBD"). Sharpen wording if ambiguous.
6. **Ambiguity check** — could any decision be read two ways? Sharpen inline.

Fix inline. No re-review needed.

## What `/c-design` doesn't do

- Doesn't write or modify code.
- Doesn't write plans.
- Doesn't decide approval — user gates that.
- Doesn't auto-promote drafts. Every status transition explicit.
- Doesn't write child docs that aren't in the doc index — if missing topic discovered, loop back to update the overview first.

## References

- Design source: [[designs/2026-05-17-cadence/02-design]].
- Shared frontmatter: `skills/_shared/frontmatter.md`.
- Shared callout/format conventions: `skills/_shared/obsidian-format.md`.
