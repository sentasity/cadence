---
name: c-brainstorm
description: Interactive Q&A that ends with enough clarity to write a design. Writes one file — a `00-overview.md` stub under `<paths.designs>/{yyyy-mm-dd-slug}/`. Detects missing `.cadence/config.yaml` on first run in a fresh repo and offers to scaffold defaults inline (no separate /c-init). Never auto-chains into /c-design.
---

# `/c-brainstorm`

You drive an interactive brainstorming Q&A and produce a single `00-overview.md` stub. You never write child docs, plans, or code. You never auto-promote into /c-design.

## Invocation forms

- `/c-brainstorm <idea text>` — start fresh with the user's idea.
- `/c-brainstorm` (no args) — ask: *"What are we tackling?"* before entering Q&A.

## Detect-and-offer: missing `.cadence/config.yaml`

Before entering Q&A, walk up from the current working directory looking for `.cadence/config.yaml`. If none found:

1. Print: *"No `.cadence/config.yaml` found in this repo or any parent. Scaffold defaults to get started? (y/n)"*
2. **If user says yes,** ask three focused questions (one at a time via `AskUserQuestion`):
   - **Paths:** *"Where should designs and plans live?"* — options: `docs/designs` (default), `docs/obsidian/designs`, or other (free text).
   - **TDD default:** *"Should plans default to TDD-shaped tasks (test → fail → impl → pass → commit)?"* — yes / no.
   - **Advisors:** *"Any repo-specific agents to register as advisors?"* — comma-separated names or "none."
3. Write `.cadence/config.yaml` to the repo root with the answers plus all other defaults from the plugin's `defaults/config.default.yaml`. Confirm the file was created.
4. Enter the regular Q&A loop (below) for the user's brainstorm input.
5. **If user says no,** exit cleanly with a one-line note: *"Config required to proceed. Run /c-brainstorm again when ready."* No error, no pointer dump.

## Q&A loop mechanics

**Step 1 — Parallel context scan** (before the first question, all in parallel):
- Read `.cadence/config.yaml` (resolve paths, naming, status vocab, advisors).
- Read recent commits: `git log -20 --oneline`.
- Read related artifacts under `paths.designs` and `paths.plans` that match the idea's slug or topic.
- Read the repo's `CLAUDE.md` (if any).

The scan is invisible — its job is to sharpen the first question, not produce a report. No questions during the scan.

**Step 2 — Scope decomposition check.** If the idea spans multiple independent subsystems, surface this immediately. Offer to write `future/{slug}.md` stubs for the other subsystems while brainstorming one. The user picks which subsystem to brainstorm now.

**Step 3 — Question discipline:**
- One question per turn. A tightly-coupled cluster of 2-3 sharing an option set is acceptable; broad dumps are not.
- Prefer `AskUserQuestion` (multiple-choice) wherever options enumerable. Each option includes a `description` explaining the trade-off and, where it helps, a `preview` showing concrete artifacts (folder structures, code, layouts).
- Mark exactly one option `(Recommended)` per question and explain why in the description. User nods or redirects — never draft from scratch.
- Free-text fallback only when the option space is genuinely open.

**Step 4 — Advisor consultation (opt-in).** When a question is genuinely architectural ("does this approach scale," "is this the right boundary"), offer: *"Want me to consult `<advisor1>`, `<advisor2>`? Token-heavy."* User opts in case-by-case. Off by default. Dispatch in parallel; opinions feed back into Q&A, never directly into the artifact. User adjudicates conflicts.

**Step 5 — OOS capture during Q&A** (see dedicated section below).

**Step 6 — Approach proposal.** Once questions converge, propose 2-3 approaches with trade-offs and a recommendation. User picks (or hybridizes). No design content gets written before this gate.

## OOS capture during Q&A

An entry lands in the running OOS list only when an option is **explicitly** rejected during Q&A with a clear reason. Each entry has a one-line rationale. Speculative "things we might not do" never land in OOS.

## Internal-consistency invariants (Invariant 1)

Never write the stub with unresolved questions in it. The `00-overview.md` stub never contains an "Open questions" section. If a question is still open, keep asking.

## Exit gate and stub

When Q&A converges, confirm: *"I have enough — writing `00-overview.md`. Proceed?"*

Stub structure (at `<paths.designs>/{yyyy-mm-dd-slug}/00-overview.md`):

- Frontmatter per `skills/_shared/frontmatter.md` (design overview shape, `linked_plans: []`).
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
- Doesn't read from or write to `future/` unless scope-decomposition triggered it.

## References

- Design source: [[designs/2026-05-17-cadence/01-brainstorm]] (in the consuming repo, if it carries Cadence's own design).
- Shared frontmatter spec: `skills/_shared/frontmatter.md`.
