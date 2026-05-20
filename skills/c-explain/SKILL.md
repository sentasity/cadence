---
name: c-explain
description: Interactive discussion of an existing design or plan — opens with a one-screen orientation (section list + plain-English summaries) then drops into open user-driven Q&A. Answers lead with plain English; cite both design sections and code locations when implementation comes up. Gaps trigger investigation (design → code → git → related docs) then `[INFERRED]` markers if still unclear. Artifact-free by default; offers to save a note or append a Q&A appendix on exit. Targets: design or plan folder, single child doc, or section anchor. Use --any for imported / non-Cadence-managed docs. Sister skills: `/c-check` (substance review), `/c-find-bugs` (concrete defects). This skill explains; it does not critique.
---

# `/c-explain`

You run an interactive discussion of an existing design or plan. The user drives the questions; you ground answers in the doc and the code under it. You never critique (that's `/c-check`), never hunt defects (that's `/c-find-bugs`), and never write a new design or plan.

## Invocation forms

- `/c-explain <design-folder-path>` — whole design.
- `/c-explain <plan-folder-path>` — whole plan.
- `/c-explain <single-doc-path>` — one child doc in isolation.
- `/c-explain <doc-path>#<heading>` — sub-section anchor (heading slug or H2/H3 title).
- `/c-explain --any <path>` — bypass the Cadence-layout check for imported/external docs.

## Entry contract

**Refuses when:** path doesn't exist; OR path is in a Cadence-managed location (under `paths.designs` or `paths.plans` from `.cadence/config.yaml`) but lacks the expected structure (no overview, missing frontmatter) — unless `--any` is set.

## Phase 1 — Parallel context scan

Before the first user question, all in parallel:

- Read the target doc(s). For a folder target, read the overview + all child docs. For a section anchor, scope the read to that section but still load the parent doc's frontmatter for context.
- Read `.cadence/config.yaml` (resolve paths, naming, advisor list).
- Extract File Map references from the doc(s) — note which code files are claimed to exist under this design's implementation.
- `git log -20 --oneline -- <slug-or-paths>` to surface recent changes touching the design's area.
- Read the repo's `CLAUDE.md` if any.

The scan is invisible — it sharpens the orientation, doesn't produce a report.

## Phase 2 — Orientation (one screen)

Print a single-screen orientation before opening Q&A:

```
% /c-explain <path>

<target>: <one-line plain-English description of the artifact>
<N sections | M lines | K File Map entries>

Sections:
  1. <section title>  — <one-sentence plain-English summary>. [[<wikilink>]]
  2. <section title>  — <one-sentence plain-English summary>. [[<wikilink>]]
  ...

Ask anything. Examples grounded in this artifact:
  - <example question 1, drawn from the doc's content>
  - <example question 2, drawn from the doc's content>
  - <example question 3, drawn from the doc's content>
```

Rules for the orientation:

- One screen — if the doc has more than 7 top-level sections, collapse to top-level only and note "<N> subsections under section X".
- Plain-English summaries are required for every entry. Not jargon, not section IDs, not paraphrases of the heading. The summary tells the user what the section is *about* in language a non-author can act on.
- Example questions must be specific to *this* doc, not generic. Read the doc; pick three meaningful "how does this actually work" questions.

After the orientation, drop into open Q&A. No structured walk; the user picks the path.

## Phase 3 — Q&A loop

For each user question:

1. **Try the doc first.** If the answer is directly in the doc, quote/summarize it. Cite the section with a wikilink and the line range. Lead with the plain-English answer; the cite is the anchor, not the answer.

2. **If implementation-shaped** ("how does X actually run," "what infra is this," "where does the code live"), reach into the File Map's referenced code files and cite them alongside the design section. Both citations are required: design (`Design: [[02-design#section]] (lines 45-58)`) and code (`Code: skills/c-foo/SKILL.md (lines 12-30)`).

3. **If the doc and code disagree,** call it out explicitly: "Design says X; code does Y." Provide both citations. Do not silently pick one.

4. **If the doc doesn't cover it** (a gap), run the investigation chain in order:
   - Code referenced by File Map.
   - `git log` and commit messages for the relevant area.
   - Other designs in `paths.designs` that cross-link to this one.
   - If still unclear, answer with `[INFERRED]` marker and explain the inference chain. Never fabricate a rationale.

5. **Cross-references.** When the user's question pulls in another section or another design, follow the wikilink and incorporate it — don't redirect the user to read it themselves.

### Answer format

```
A: <plain-English answer, 2-6 sentences, no jargon ladder>

  Design: [[<doc>#<section>]] (lines <a>-<b>)
  Code:   <path> (lines <a>-<b>)
          <path> (lines <a>-<b>)
  [INFERRED] (only when applicable) — <one-line inference chain>
```

For short answers (one-fact lookups), inline the cite: *"`audits.default` lists which audits run — `[[09-packaging-config#audits]] (line 42)`."*

## Phase 4 — Exit gate

Conversation ends when the user signals so ("got it", "thanks", "exit", explicit close). Before silently exiting, offer once via `AskUserQuestion`:

- **Just exit, nothing written** *(Recommended unless the conversation produced a concrete artifact-worth capture)*.
- **Drop a `future/learned-from-{slug}.md` note** — write a short standalone note in `<paths.future>` capturing what was learned for later.
- **Append a Q&A appendix to the design** — add a `## Q&A — <date>` section at the bottom of the relevant doc with the discussion's key Q&A pairs. Only available when the target is a Cadence-managed design or plan (not `--any`).

If "just exit," conversation ends cleanly with no artifact.

> **Hard gate — every `AskUserQuestion`, no exceptions:** (1) the `question` opens with a plain-English lead a newcomer could follow — what's being decided and why it matters now; (2) exactly one option is marked `(Recommended)` and listed **first** — triage / "which next?" menus included ("your call" is a non-answer); (3) each option's `description` gives the one-sentence trade-off. Full spec: `skills/_shared/ask-user-question.md`.

## Boundary against sister skills

- **`/c-check`** asks "is this design good?" — substance review with severity tiers and a recommended-next-action verdict. `/c-explain` asks "what does this design say and how does it work?" — explanation, not judgment. If the user asks "is this section actually a good idea?" in `/c-explain`, redirect: *"That's a `/c-check` question. I can describe what it says; for a quality review, run `/c-check <path>`."*
- **`/c-find-bugs`** asks "what specific defects exist?" — concrete defects with file:line citations. `/c-explain` may note that "design says X, code does Y" when they diverge, but does not enumerate defects. If the user asks "are there bugs in this?" redirect: *"Try `/c-find-bugs <path>` — it's built for that."*
- **`/c-brainstorm`** in thought-partner mode also runs interactive Q&A, but the topic is open and there's no existing artifact to ground in. `/c-explain` requires a target artifact and grounds every answer in it.

## What `/c-explain` doesn't do

- Doesn't critique substance (that's `/c-check`).
- Doesn't enumerate defects (that's `/c-find-bugs`).
- Doesn't modify the target doc — except via the explicit "Append Q&A appendix" exit option.
- Doesn't write new designs or plans (that's `/c-brainstorm` → `/c-design` → `/c-plan`).
- Doesn't validate deployed behavior (that's `/c-validate`).
- Doesn't speculate without the `[INFERRED]` marker.

## References

- Shared frontmatter spec: `skills/_shared/frontmatter.md`.
- Shared question/option formatting (exit gate): `skills/_shared/ask-user-question.md`.
- Sister diagnostics: `/c-check` (substance), `/c-find-bugs` (defects).
