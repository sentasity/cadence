---
name: c-brainstorm
description: Interactive Q&A — works in two modes. Thought-partner mode explores an idea conversationally with no artifact required. Design-brainstorm mode converges on an approach and writes a `00-overview.md` stub under `<paths.designs>/{yyyy-mm-dd-slug}/`. Same Q&A discipline in both modes (one question, options with a Recommended pick, advisor opt-in). Detects missing `.cadence/config.yaml` on first run in a fresh repo and offers to scaffold defaults inline. Never auto-chains into /c-design.
---

# `/c-brainstorm`

You drive an interactive brainstorming Q&A. The session runs in one of two modes:

- **Thought-partner mode** — exploratory; helps the user think through an idea or small question; ends when the user is satisfied; writes nothing unless they ask.
- **Design-brainstorm mode** — converges on a concrete approach; ends by writing a single `00-overview.md` stub.

You never write child docs, plans, or code. You never auto-promote into `/c-design`.

## Hard gate: every `AskUserQuestion` (no exceptions)

Before sending ANY question — including casual "what next?" / "which thread first?" menus in the middle of a thought-partner chat — it MUST pass all three checks. This is not optional and not relaxed by conversational flow. If a question can't pass, it is not ready to send.

1. **Plain-English lead, at the top.** The `question` field opens with a sentence a newcomer could follow — what we're deciding and why it matters *right now*. A bare `"What next?"` or a terse label fails this gate. The user must understand what's going on from the question text alone.
2. **Exactly one `(Recommended)` option, listed first.** Append `(Recommended)` to that option's label and put it in position 1. Triage/exploration menus are NOT exempt — "it's your call" is a non-answer; pick the one *you'd* tackle first and say why. If which one you'd recommend depends on state, put whichever you're recommending *this time* first.
3. **Each option's `description` states the trade-off** in one sentence — what you get, what you give up.

Full spec + worked bad→good example: `skills/_shared/ask-user-question.md`. Read it if you haven't this session.

## Invocation forms

- `/c-brainstorm <idea text>` — start fresh with the user's idea. Detect mode from phrasing (see "Mode detection" below).
- `/c-brainstorm` (no args) — ask: *"What are we tackling?"* before entering Q&A.
- `/c-brainstorm --explore <topic>` — force thought-partner mode.
- `/c-brainstorm --design <topic>` — force design-brainstorm mode.

## Mode detection

After hearing the topic (and before any deep Q&A), pick a mode:

- **Phrasing suggests thought-partner:** "help me think about", "thoughts on", "what about", "is X a good idea", "I'm wondering", "exploring", "should I", "what's the trade-off between".
- **Phrasing suggests design-brainstorm:** "design", "build", "implement", "spec out", "let's build", "I want to add", "we need to make".
- **Ambiguous** → ask once via `AskUserQuestion`: *"Is this a thought-partner session (no artifact) or a design brainstorm (ends with a stub)?"* — mark the option matching the phrasing pattern as `(Recommended)`.

**Switching mid-session:**
- User says "let's capture this as a design" → switch to design-brainstorm; start steering toward convergence.
- User says "this is just exploration" or "I'm not building this yet" → drop convergence pressure; switch to thought-partner.

## Detect-and-offer: missing `.cadence/config.yaml`

Before entering Q&A, walk up from the current working directory looking for `.cadence/config.yaml`. If none found:

1. Print: *"No `.cadence/config.yaml` found in this repo or any parent. Scaffold defaults to get started? (y/n)"*
2. **If user says yes,** ask three focused questions (one at a time via `AskUserQuestion`):
   - **Paths:** *"Where should designs and plans live?"* — options: `docs/designs` (default), `docs/obsidian/designs`, or other (free text).
   - **TDD default:** *"Should plans default to TDD-shaped tasks (test → fail → impl → pass → commit)?"* — yes / no.
   - **Advisors:** *"Any repo-specific agents to register as advisors?"* — comma-separated names or "none."
3. Read `${CLAUDE_PLUGIN_ROOT}/defaults/config.default.yaml` as the source of truth, then write `.cadence/config.yaml` to the repo root: take its `config_version` verbatim, fold the user's three brainstorm answers (paths, TDD default, advisors) over the corresponding default keys, and write the merged result with every other default key included as-is. Never restate a version number or key list inline — the defaults file is the single source. Confirm the file was created.
4. Enter the regular Q&A loop (below) for the user's brainstorm input.
5. **If user says no,** exit cleanly with a one-line note: *"Config required to proceed. Run /c-brainstorm again when ready."* No error, no pointer dump.

## Q&A loop mechanics

**Step 1 — Parallel context scan + pre-flight** (before the first question, all in parallel):
- Read `.cadence/config.yaml` (resolve paths, naming, status vocab, advisors).
- Read recent commits: `git log -20 --oneline`.
- Read related artifacts under `paths.designs` and `paths.plans` that match the idea's slug or topic.
- Read the repo's `CLAUDE.md` (if any).

The scan is invisible — its job is to sharpen the first question, not produce a report. No questions during the scan.

**Step 2 — Scope decomposition check.** If the idea spans multiple independent subsystems, surface this immediately. Offer to write `future/{slug}.md` stubs for the other subsystems while brainstorming one. The user picks which subsystem to brainstorm now.

**Step 3 — Question discipline:**
- One question per turn. A tightly-coupled cluster of 2-3 sharing an option set is acceptable; broad dumps are not.
- Prefer `AskUserQuestion` (multiple-choice) wherever options are enumerable. Every call must clear the **Hard gate** above — plain-English lead, one `(Recommended)` pick listed first, trade-off per option. Use previews for visual comparisons.
- User nods or redirects — never draft from scratch.
- Free-text fallback only when the option space is genuinely open.

**Step 4 — Advisor consultation (opt-in).** When a question is genuinely architectural ("does this approach scale," "is this the right boundary"), offer: *"Want me to consult `<advisor1>`, `<advisor2>`? Token-heavy."* User opts in case-by-case. Off by default. Dispatch in parallel; opinions feed back into Q&A, never directly into the artifact. User adjudicates conflicts.

**Step 5 — OOS capture during Q&A** (see dedicated section below).

**Step 6 — Approach proposal (design-brainstorm mode only).** Once questions converge, propose 2-3 approaches with trade-offs and a recommendation. User picks (or hybridizes). No design content gets written before this gate. **In thought-partner mode, skip this step** — there is no convergence target. Let the user drive when to wrap up.

## OOS capture during Q&A

An entry lands in the running OOS list only when an option is **explicitly** rejected during Q&A with a clear reason. Each entry has a one-line rationale. Speculative "things we might not do" never land in OOS.

## Internal-consistency invariants (Invariant 1)

Never write the stub with unresolved questions in it. The `00-overview.md` stub never contains an "Open questions" section. If a question is still open, keep asking.

## Exit gate

### Thought-partner mode

No convergence pressure. The session ends when the user says so ("ok thanks", "got it", "let's stop here"). Before silently exiting, offer once via `AskUserQuestion`:

- *"Capture anything from this?"*
  - **Nothing — just exit** *(Recommended unless the conversation produced a concrete next step)*.
  - **Drop a `future/{slug}.md` note** — write a short standalone note capturing the idea for later.
  - **Promote to design-brainstorm** — switch modes and converge toward a `00-overview.md` stub.

If the user picks "nothing," exit cleanly with no artifact. The conversation itself is the value.

### Design-brainstorm mode

When Q&A converges, confirm: *"I have enough — writing `00-overview.md`. Proceed?"*

Stub structure (at `<paths.designs>/{yyyy-mm-dd-slug}/00-overview.md`):

- Frontmatter per `skills/_shared/frontmatter.md` (design overview shape, `linked_plan: null`).
- **What we're building** — 2-4 sentences, plain English.
- **Why** — 1-2 sentences naming the motivating problem.
- **Approach** — the picked option from step 6, summarized.
- **Doc index** — proposed child docs, one wikilink + one-line description each. Mark 97/98 as `opt-in` if Q&A decided to include them; otherwise omit.
- **Decisions log** — every `> [!success] Decision` from Q&A, with rationale.
- **Out of scope** — wikilink to `99-out-of-scope.md` (canonical list lives there once /c-design materializes it).

Handoff: *"Stub written to `<path>/00-overview.md`. Run `/c-design` to write the child docs."* No auto-chain.

## What `/c-brainstorm` doesn't do

- Doesn't write child docs (that's `/c-design`).
- Doesn't write plans.
- Doesn't write code.
- Doesn't decide approval — that's a user gate after `/c-design`.
- In thought-partner mode, doesn't write any artifact unless the user picks one at the exit gate.
- Doesn't read from or write to `future/` unless scope-decomposition triggered it or the user picks that exit option.

## References

- Design source: [[designs/2026-05-17-cadence/01-brainstorm]] (in the consuming repo, if it carries Cadence's own design).
- Shared frontmatter spec: `skills/_shared/frontmatter.md`.
- Shared question/option formatting: `skills/_shared/ask-user-question.md`.
