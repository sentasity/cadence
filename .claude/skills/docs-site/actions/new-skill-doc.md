# Action: new-skill-doc

When Cadence gains a new command, you make sure that command does not ship without a help page. You build a starter reference page from the new command's definition, wire it into the site's navigation, and point out which course lesson should link to it. The goal is simple: no command without docs.

This file is self-contained. You can run new-skill-doc from this file alone.

## Trigger

A new `/c-*` command ships in the plugin — that is, a new `skills/<new>/SKILL.md` appears with no matching `website/src/content/docs/reference/<new>.mdx`. The user names the new command (for example "new-skill-doc for `c-foo`"), or you detect the unpaired source while running drift-check.

## What it does

### 1. Scaffold the reference page

Read the new command's `skills/<new>/SKILL.md` and create `website/src/content/docs/reference/<new>.mdx`, seeding the standard reference template from the source. The reference uses one fixed seven-field template, in this order, for every command. Fill each field; where a field does not apply to this command, write **None** rather than omitting it, so the page stays uniform and scannable:

1. **Purpose** — one sentence: what the command does, in plain English (seed from the source frontmatter `description`).
2. **When to use it** — the situation that should make a reader reach for this command, and where relevant when *not* to.
3. **Invocation forms** — the exact ways to call it, including modes and optional arguments.
4. **Inputs & preconditions** — what must already exist for it to run (e.g. an approved design, a `draft`-status plan, a `.cadence/config.yaml`).
5. **What it produces** — the tangible artifact or state change: the file, folder, status flip, or commit the reader will see afterward.
6. **Gates & guarantees** — the explicit gate(s) it enforces and the things it will never do silently (e.g. never auto-chains, never auto-deploys, never amends commits, never skips hooks).
7. **Related commands** — the neighbouring commands in the pipeline plus the matching course deep-dive lesson to read for the *why*.

When seeding raw Markdown links in the page body (e.g. the "Related commands" field), write them base-prefixed — `](/cadence/course/<phase>/)` and `](/cadence/reference/<command>/)` — because the site deploys under the `/cadence/` base and Astro does not auto-prepend the base to authored Markdown links. (Frontmatter and sidebar links Starlight renders itself stay root-relative; see the link convention in `02-content-plan`.)

### 2. Register it in the Starlight sidebar config

Add the new page to the **Reference** group in `astro.config.mjs` so it appears in the site navigation. (The sidebar model is owned by the site architecture; add the entry to the existing Reference group rather than inventing a new group.)

### 3. Flag the course cross-link

Identify which course deep-dive lesson should cross-link the new command, so the narrative and reference stay connected. The deep dives are: D1 Brainstorm, D2 Design, D3 Plan, D4 Execute, D5 Audit, D6 Validate, and D7 Diagnostics (the combined `check` / `find-bugs` / `explain` lesson). Pipeline commands map to their phase deep dive; off-pipeline diagnostic commands map to D7. Report which lesson should gain the cross-link — do not silently edit the lesson; surface it for the maintainer to wire and to fill the page's "Related commands" field.

## The scaffold is a starting point, not a finished page

The reference is still hand-written and hand-polished in the site's plain-English voice. new-skill-doc removes the blank-page problem and guarantees registration — but a maintainer still writes the reader-facing prose. After scaffolding, tell the user the page is a draft seeded from the source and still needs a hand-polish pass before it is reader-ready. This is what stops doc-less commands from shipping, without pretending an auto-seeded page is finished.
