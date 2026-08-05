# Action: drift-check

You compare each hand-written reference page against the command it documents and surface where they have fallen out of step — reporting the gap and proposing a concrete patch, but never editing a page on your own. This is the keystone action of the `docs-site` skill: it defends against the central risk of a hand-written reference, which is that the page quietly falls behind its command every time that command changes.

This file is self-contained. You can run drift-check from this file alone.

## What it compares

The reference is a set of hand-written pages, one per Cadence command. For each command, pair:

- the reference page `website/src/content/docs/reference/<command>.mdx`
- against its source `skills/<command>/SKILL.md`

The mapping is 1:1 by slug.

**Discover the pairs; never work from a hardcoded list.** List `website/src/content/docs/reference/*.mdx` and `skills/*/SKILL.md`, then pair by slug. A list written into this file goes stale the moment a command ships, and a page missing from it is silently skipped, which is exactly the failure drift-check exists to prevent. (This is not hypothetical: `c-worktree` shipped, got a reference page, and was absent from this file's former list of nine.)

Two mismatches are themselves findings, so report them rather than passing over them:

- **Page with no `SKILL.md`:** either a cross-cutting page (see below) or a page for a command that no longer exists.
- **`SKILL.md` with no page:** a shipped command the docs never got. Point the user at the `new-skill-doc` action.

Run drift-check across every discovered pair by default. If the user names specific commands, restrict the pass to those pages.

## Cross-cutting pages

Some pages are not 1:1 with any one command but still assert things commands guarantee. They drift the same way and are in scope whenever the change that prompted this pass touched what they describe:

- `website/src/content/docs/reference/config.mdx`: every config key's meaning and default, against `defaults/config.default.yaml` and the skills that read those keys.
- `website/src/content/docs/reference/notion-mode.mdx` and the `concepts/` pages: check these against the relevant `skills/_shared/*.md`, which is where cross-command behavior actually lives.

A change to a `skills/_shared/` doc is a strong signal that a concept or reference page drifted even when no single command's page did. (Again, not hypothetical: the v0.15.0 `/c-worktree` change scoped the merge lock in `skills/_shared/worktree-lifecycle.md`, and both `concepts/parallelism-and-worktrees.mdx` and `config.mdx` were left asserting the old, unconditional rule.)

Same rules as everything else here: report and propose, approve per page, never auto-fix.

## Semantic, not textual

The comparison is **semantic, not a textual diff.** The reference page is intentionally worded differently from the source `SKILL.md` — it is hand-polished for an intent-level reader — so a line-by-line diff would be pure noise. Do not diff the files. Instead, read both and ask: *does this page still correctly describe what the command actually does?*

## The four load-bearing facts to check

For each command, read the source `SKILL.md` and the reference page, then check whether the page still tells the truth about these four facts:

1. **Purpose / `description`** — the command's purpose, including the frontmatter `description` of the `SKILL.md`. Does the page's "Purpose" still match what the command is for?
2. **Steps and their order** — the steps the command runs and the order it runs them in. Has the source added, removed, or reordered steps the page does not reflect?
3. **Gates and stopping conditions** — the explicit gates, approvals, and stopping conditions (e.g. "never auto-chains", "never auto-deploys", per-page approval, a `Touches:` conflict gate). Has the source gained or changed a gate the page omits or misstates?
4. **What it produces** — the artifacts, status transitions, and files the command produces. Does the page's "What it produces" still match the real output (the design folder, plan folder, status flip, or commit)?

These four facts map directly onto the reference template fields (Purpose, Invocation/Inputs, Gates & guarantees, What it produces), so checking them is the same as checking the page is still accurate field by field.

**Mermaid diagrams count as claims too.** If a page (reference or course) renders a ```` ```mermaid ```` diagram of the command's flow, its nodes and edges assert the same four facts — steps, order, gates, outputs. Read the diagram as part of the page and check it against the source `SKILL.md`: a flowchart that still shows an old step order, a dropped gate, or a renamed status is drift, and the proposed patch edits the diagram source, not just the prose around it.

## Behavior: report and propose, never auto-fix

For every divergence you find, you do two things and only those two things:

1. **Report the gap** — state what the `SKILL.md` now says versus what the page still claims.
2. **Propose a concrete patch** — write the exact suggested edit to the page that would close the gap, in the page's existing voice and structure.

Then **the user approves per page.** You never write the change automatically.

> Rationale: auto-fixing would clobber the hand-written polish that justifies hand-writing the reference in the first place, and silent edits violate Cadence's own gated, no-silent-drift philosophy. This action mirrors how the `/c-*` commands themselves surface drift for human approval rather than acting unilaterally.

**Hard rules — non-negotiable:**

- Never apply an edit without explicit per-page approval.
- Never batch-approve across pages. Each page is a separate decision so the maintainer can keep, reword, or reject any proposed patch independently.
- Only after the user approves a specific page's patch do you write that single page. Then move to the next page's decision.

## Output shape

Produce a per-page report. For each reference page, emit one block:

**For a page that has drifted:**

- **Page:** `website/src/content/docs/reference/<command>.mdx`
- **Source:** `skills/<command>/SKILL.md`
- **Divergences:** a list, each stating what the source now says versus what the page still claims — for example: "source adds a `Touches:` conflict gate that the page does not mention", or "source reordered the self-review pass to run before status flips to `in-review`; page describes the old order".
- **Proposed patch:** the concrete suggested edit to the page (the exact replacement text or insertion), in the page's existing voice.
- **Decision:** an explicit `Approve / Reject` prompt for this page.

**For a page that is still accurate:**

- **Page:** `website/src/content/docs/reference/<command>.mdx` — **Clean.** (No divergences, no patch.)

Walk the report page by page. For each drifted page, present its block and wait for the user's approve/reject before touching anything. Apply only approved patches, one page at a time.
