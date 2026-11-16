---
name: c-design
description: Use when a Cadence design stub (00-overview.md from /c-brainstorm) exists and the user wants the full design written out.
---

# `/c-design`

You turn the `00-overview` stub into the design: by default **one document**, for a person who decides what gets built and won't read code. It says why, what the feature does, and what was decided. How it gets built is the plan's job.

## Entry contract

**Requires:** the design artifact for `{yyyy-mm-dd-slug}` exists — check via `skills/_shared/storage-resolution.md` (artifact_exists) — and its `00-overview`, read via read_artifact, carries `status: draft`; do not assume a `<paths.designs>/…/00-overview.md` file path.

**Refuses when:** the overview is missing, status ≠ draft, or the stub carries an "Open questions" block (Invariant 1 violation: the stub was written prematurely).

## The design document (`00-overview`)

Sections, in order:

1. **Why** — the problem and who has it, in a few sentences.
2. **What it does** — the behavior in plain English, from the point of view of whoever the feature serves (a person in a UI, an API caller, an operator): the normal path, what they see, what happens when things go wrong.
3. **Examples and wording** — concrete inputs and outcomes, and the exact user-facing copy (labels, messages, errors) where wording matters.
4. **Visuals** — only where a picture decides something: a mermaid flow or state diagram inline, or the `95-visual-contract` slot for significant UI (see below).
5. **Decisions** — one numbered list, each entry `D<n> — <the decision>. Why: <rationale>.` IDs never change; plans cite them as `(design D3)`.
6. **Out of scope** — each entry: what is cut, why, and the decision or section where it surfaced (`D<n>`, or a link to the section). No speculative entries.

**The rule: no implementation in a design.** No schemas, signatures, file or module lists, or code blocks (mermaid excepted). Name things the way a user or operator would. A value the design must pin (a limit, a timeout, a price) is stated as behavior: "a key is rejected after 3 failed attempts", not a constant's name.

**Word target:** `design.word_target` per document (default 1500). It is a target for the writer, not a cap for the reader: a design over it by more than a fifth gets cut back first (plan content is the usual excess), and only then split into topic documents.

**Topic documents are opt-in.** When the feature genuinely has separate areas that each need their own behavior and examples, offer topic documents (`01-<topic>`, `02-…`) in the step 1 confirmation. Each follows the same rules and word target; the overview keeps Why, the Decisions list, and Out of scope for the whole design and lists the topic documents under a `## Docs` section. `97-infrastructure-inventory` (services and resources this touches, one line each) and `98-architecture-diagrams` (dense mermaid) are opt-in topic documents too.

Reserved slots: `00-overview`, `95-visual-contract`, `97-infrastructure-inventory`, `98-architecture-diagrams`. Refuse to scaffold a conflicting name. Each slot is written per `skills/_shared/storage-resolution.md` (write_doc): a `<slot>.md` file on the filesystem backend, a titled sub-page on notion. Designs written before v0.27 may also carry `00a-plain-english` and `99-out-of-scope`; read them as part of the design, never create them.

## Frontmatter

See `skills/_shared/frontmatter.md`. The overview carries lifecycle; topic documents carry only `title:`.

## Writing flow

1. **Read the stub** via read_artifact. Resolve config by running `node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-config.js"` (`design.word_target`, `authoring.*`; contract in `skills/_shared/config-resolution.md`; never read config files directly). Confirm the shape in one exchange: *"One design document, ~`<word_target>` words."* Offer topic documents only when the stub's scope calls for them, and offer `95-visual-contract` when the feature has significant user-facing UI (see Visual contract and mockups); a mostly-backend design with an incidental UI touch gets no offer.
2. **Write.** One document: write it yourself, inline. With topic documents, resolve `authoring.design_mode` (see Generation mode).
3. **Invariant 2 — consistency.** If a question surfaces that contradicts or refines a decision, STOP writing, surface the conflict, and ask the user. On resolution, amend the Decisions list and every section it touches, then resume.
4. **Out of scope immediately.** A decision not to do something lands in Out of scope the moment it's made, with its rationale and link.
5. **Resolve cross-references.** Once every document exists, call `skills/_shared/storage-resolution.md` (resolve_links) once over the artifact: a no-op on the filesystem backend, the mention second pass on notion (see `skills/_shared/notion-translation.md`).
6. **Self-review** (below), over the design read back via read_artifact.
7. **Flip status to `in-review`** per `skills/_shared/storage-resolution.md` (set_status), which bumps `updated:`. Print: *"Design ready for review. Walk through it and tell me when to mark it `approved`."*
8. **Status `approved`** is user-driven only. On "approved", flip status (set_status); when the design has a `95-visual-contract` slot, rewrite its freeze record from `frozen: none` to `frozen: NN` (the latest version) via write_doc in the same moment, the invariant `/c-plan` relies on. Post-approval mockup changes are design drift, never a silent new version. Print: *"Run `/c-plan` to write the implementation plan."*

## Generation mode (topic documents only)

With no topic documents there is nothing to choose: you write the one document. With topic documents, resolve `authoring.design_mode`; a concrete value is used without asking, and `ask` asks via `AskUserQuestion` (default `(Recommended)` = all-at-once):

- **All-at-once:** you write the overview, then dispatch one generator agent per topic document in parallel (up to `authoring.max_parallel`), each prompt naming the storage backend, its syntax reference (`skills/_shared/obsidian-format.md`, plus `skills/_shared/notion-translation.md` on notion), these rules, and the word target. Then dispatch `cadence-doc-consistency` once over the set; it reconciles trivial wording and surfaces contradictions via `AskUserQuestion`.
- **One-by-one:** write one document, pause (*"`<doc>` written. Review and tell me to continue, revise, or stop."*), loop.
- **Inline:** you write every document in turn, no pauses, no sweep.

## Visual contract and mockups (the 95 slot)

`95-visual-contract` is opt-in for designs with significant user-facing UI: it declares the governed surfaces, indexes every mockup version, and carries the visual contract. Mockups are single self-contained HTML files with no build step (CSS/JS inlined; the only allowed external resource is a web-font stylesheet with a fallback stack), authored at the surface's final width, stored via `skills/_shared/storage-resolution.md` (write_mockup) and read back via read_mockup. Self-containment is what makes a mockup a durable contract: it must render the same weeks later, offline, on another machine.

Mockups are **local files on every backend**, notion included: no upload, no embed. The 95 version index records each version's `file://` URL. Where files land is `mockups.dir` (`skills/_shared/storage-resolution.md` § Mockup directory resolution): the design's `mockups/` subfolder by default on the filesystem backend; on notion `/c-design` asks once before version `01` and offers to save the answer to `.cadence/config.local.yaml`.

A brainstorm stub that already lists `95-visual-contract` counts as the opt-in taken; a no leaves the design mockup-free with no further prompts.

**Iteration loop** (alongside writing; the 95 doc itself goes through write_doc):

1. **Author a version** — mockup content only, no rationale or decisions — and store it via write_mockup as the next `NN` (zero-padded from `01`). Version `01` may adopt a brainstorm sketch: brainstorming stays artifact-free, and `/c-design` is the only skill that calls write_mockup.
2. **Add the index row:** date, what changed, what drove it, and the `file://` URL.
3. **Present it** by path and `file://` URL (a browser won't follow a `file://` link clicked from a web page, Notion's included, so the URL is there to copy).
4. **Iterate or settle.** Feedback makes a new `NN` (append-only: a version shown to a reviewer is never edited). Visual agreements go in 95's contract sections; decisions go in the Decisions list.

**Design-system detection.** Before version `01`, look for design token files, a Tailwind config, CSS custom-property sheets, or a shared component library. One candidate: author against its tokens. Several or none: ask via `AskUserQuestion` (each candidate, or `none`); with `none`, the mockup's own values become the contract and 95 names only the load-bearing ones.

## Callouts and readability

The callout set and backend rule are in `skills/_shared/obsidian-format.md`; on notion, author native `<callout>` blocks per `skills/_shared/notion-translation.md`, never `> [!type]`. Reach for a mermaid diagram, equation block, or collapsible detail only when it says something more clearly than prose (§ Readability constructs).

## Self-review pass (before flipping to in-review)

1. **Placeholder scan** — no `TBD`, `TODO`, `(fill in)`, `TBC`, or empty sections.
2. **No implementation** — no schemas, signatures, file or module paths, or non-mermaid code blocks. Move anything found to the decision it supports, stated as behavior, or drop it (the plan will decide it).
3. **Word target** — each document within `design.word_target` plus a fifth; trim, then split, as above.
4. **Decisions** — every decision is in the one Decisions list with a rationale, and every section agrees with it.
5. **Out of scope** — every entry has a rationale and a link to where it surfaced.
6. **Invariant 1** — nothing reads like an open question ("should we…", "we might…").
7. **Ambiguity** — no decision or behavior can be read two ways.
8. **Wikilinks** resolve.
9. **Callout form (notion only)** — no escaped callout remnants (`\[!` or a quote starting `> [!`) in the read-back; rewrite as `<callout>` blocks.
10. **95 designs only:** the current mockup has no external script, image, or stylesheet beyond a web font with a fallback stack (inline a CDN framework's purged CSS); no rationale or decision sections inside the HTML; every `NN` file has an index row and every row names an existing file with a matching `file://` URL, in order; the 95 doc has Surfaces (≥1), Source of truth, Version index, the Freeze record line, then Layout anchors, Control choices, Interaction idioms, and Default states.

Fix inline. No re-review needed.

## What `/c-design` doesn't do

- Doesn't write code or plans.
- Doesn't decide approval; the user does.
- Doesn't auto-promote. Every status change is explicit.
- Doesn't write a topic document the overview doesn't list: add it to `## Docs` first.

## References

- Shared frontmatter: `skills/_shared/frontmatter.md`.
- Shared callout and format conventions: `skills/_shared/obsidian-format.md`.
