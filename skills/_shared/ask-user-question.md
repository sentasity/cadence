# AskUserQuestion: question + option formatting

Shared spec for any Cadence skill that uses `AskUserQuestion`. Especially load-bearing when walking a long list of findings, tasks, or drift decisions — by the time the user sees question 14, they no longer have the original report in view. The question text and option descriptions are the **only** context they have at decision time.

## Required structure

### Question text

Leads with plain-English framing — not jargon, not a bare file:line cite, not just a section header.

Three things to include, in order:

1. **What we're deciding** — one sentence, accessible to someone who hasn't read the report.
2. **Why it matters** — one sentence on the stake or risk. What happens if we get this wrong, or what does this unblock.
3. **Position context** (when walking a list) — `Finding 14/17 — 8 applied, 5 skipped so far`. Lets the user re-orient without scrolling.

A terse technical label ("Drift path") is not a substitute for any of these. It can supplement them, never replace them.

### Options

- **2–4 options.** More than 4 means the question is poorly scoped — split it.
- **Exactly one option marked `(Recommended)`.** Not "leaning toward," not "you might prefer." One pick, surfaced. The rationale lives in that option's `description` — not buried elsewhere.
- **The `(Recommended)` option is listed first.** Position 1, always — matching `AskUserQuestion`'s own convention. The user should never have to scan the list to find your pick.
- **A recommendation is required even when the question is "which should we look at first?"** Triage and exploration menus ("which thread do you want to dig into first?", "which finding next?") are not exempt just because every option is technically valid. The user is asking for your judgment on sequencing or priority — give it. "It's your call" is a non-answer; pick the one *you* would tackle first and say why in its description. If which option you'd recommend depends on runtime state (e.g. severity counts), place whichever you're recommending *this time* first.
- **Each option's `description`** explains the trade-off in one sentence — what you get and what you give up. Not just what the option *is* (the label already says that).
- **Use `preview`** for concrete artifacts the user needs to visually compare (folder structures, code diffs, layouts). Skip preview for preference questions where descriptions suffice.

## Why this matters

When walking a long list of findings or tasks, the user has typically forgotten the original report by item 10. Brief technical labels plus bare option names ("A. Schema-version stamp + documented backfill path") force the user to either scroll back through 30 prior questions or guess.

The cost of one extra sentence of context per question is negligible. The cost of a user making a wrong decision because they lost context is large. Optimize for the latter.

## When this rule applies

- Per-finding apply loops (`/c-check`, `/c-find-bugs`).
- Per-task drift handling (`/c-execute`).
- Audit failure response paths (`/c-audit`).
- Brainstorm Q&A (`/c-brainstorm`).
- Triage / exploration menus — "which of these do you want to dig into first?", "which finding next?". These need a recommendation just as much as trade-off decisions: the user is asking for your sequencing judgment.
- Anywhere `AskUserQuestion` is the primary interaction surface for a non-trivial decision.

Simple yes/no gates ("Proceed?") don't need the full structure but should still include a one-line description per option and a recommendation — list the recommended answer first.

## Worked example: bad → good

**Bad** (the kind of thing this spec exists to prevent):

> Question: *Resolve the parquet eligibility-flag drift?*
>
> A. Schema-version stamp + documented backfill path
> B. Re-stamp eligibility flags at engine runtime
> C. Document drift as expected; admin alert

The user has to remember what "the parquet eligibility-flag drift" is, what each option costs, and which one was the report's recommendation.

**Good:**

> Finding 14/17 — 8 applied, 5 skipped so far.
>
> Question: *How should we handle stale eligibility flags in hourly parquets?*
>
> Stale flags cause the engine to under-recommend DBSP until the next backfill. The trade-off is between rigor (catch drift explicitly, more engineering) and cost (accept drift, document it, page the operator).
>
> Options:
> - **A. Schema-version stamp + documented backfill path** *(Recommended)* — Engine compares stamped version against current; flags drift in Sentry + admin UI. Most rigorous; one extra column + small admin work.
> - **B. Re-stamp at engine runtime** — Joins against current metadata on every read. Eliminates drift; pays compute cost per query.
> - **C. Document as expected; alert on new prefixes** — Cheapest; relies on operator to run backfill when a new prefix shows up.
