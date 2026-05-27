---
name: c-validate
description: Walks a plan's 96-validation.md post-deploy. Category C (prereqs) first, then A (automated), then B (manual workflow). Checks off items as it walks. Flips plan status to `completed` on full pass. Reads `linked_design:` and offers to flip the design to `completed` (user confirms).
---

# `/c-validate`

You walk a plan's post-deploy validation doc. You do NOT deploy. You verify deployed behavior by running automated checks, asking the user to do manual UI work, and checking observable signals.

## Invocation

`/c-validate <path-to-plan-folder>`

## Status gates

| Plan status | Behavior |
|---|---|
| `draft` / `in-progress` | Refuse: *"Plan isn't implemented yet. Run `/c-execute` first."* |
| `implemented` | Run the walk. |
| `completed` | Run anyway (re-validation after a re-deploy). Reset checkboxes per config. |
| `on-hold` / `superseded` | Refuse with status-mismatch error. |

## Walk order (strict)

**Recommendation note (once, at the start of the walk).** Per `skills/_shared/browser-validation.md`: if this plan's `96-validation.md` has at least one Category B item with an `e2e:` reference AND no runner is configured or detected (`validate.browser_command` left at default `npx playwright test` and `auto` detection finds no suite), print one informational line recommending a runner (Playwright by default), then proceed — those items take the manual fallback. A repo with a runner configured/detected prints nothing. Once per run; never nag.

**1. Category C — Prerequisites first.** Read section C, print the prereq list, ask user to confirm each: *"Backend deployed? Migration run? Test users seeded? (y/each)"* Walk BLOCKS until every C item confirmed. No prereq = no validation.

**2. Category A — Automated.** Run each item itself: `curl`, `psql`, `pytest`, etc. Mark `- [x]` as each passes. Stop on first failure; surface exact output for user resolution.

**3. Category B — Manual workflow last.** Resolve `validate.browser_driver` to delegate-or-manual **once** at the start of this pass, per `skills/_shared/browser-validation.md` (`auto` runs suite detection and delegates if found; `playwright` forces delegation; `manual` forces manual). Then, for each Category B item:
- **If the driver resolved to delegate AND the item carries an `e2e:` line → delegate.** Compose `<browser_env_preamble> && <browser_command> <spec> -g "<grep>"` (drop the `&& ` prefix if no preamble; drop `-g` if the item has none), run it headless and non-interactively, and map the exit code: **exit 0 → mark `- [x]`**; **non-zero → a validation failure**, routed through the existing **Failure handling** section below (stop the walk, surface exact output, offer Fix / OOS / Abort). No new failure path.
- **Otherwise → manual (today's behavior).** Print the human-readable step list ("Log in as X → click Y → see Z"); user does the clicks; run the verification (DB query or API call) after each step or at walkthrough's end; mark `- [x]` when verified.

The C→A→B order is unchanged, and Tracking's checkpoint-before-yield flush applies to delegated and manual items alike: a passing item's `- [x]` is written to `96-validation.md` before control leaves you.

## Tracking

- Every entry in A/B/C carries `- [ ]` at plan-write time.
- Check them off as you walk.
- **Checkpoint before yielding.** Follow `skills/_shared/progress-checkpoint.md`: write each `- [x]` to `96-validation.md` the moment its check passes, and flush every passed item to disk BEFORE pausing — before asking the user to do a Category B manual step, before a clarifying question, and before stopping on a Category A failure. The just-passed checks must be on disk before control leaves you, or a context loss reruns them.
- On re-runs (status already `completed`), reset checkboxes per `config.validate.reset_checkboxes_on_rerun` (default `true`).

## Failure handling

| Response | Effect |
|---|---|
| **Fix and retry** | Walk pauses. User (or PM) addresses failure. Resume from failed item. |
| **OOS** | Failure represents work never going to be tested this round. Move entry to plan-side `99-out-of-scope.md` with rationale; remove from 96; continue walk. |
| **Abort** | Status stays at `implemented`. Surface what's broken. User comes back later. |

Status NEVER advances to `completed` with any unchecked 96 item. No silent passes.

## On full pass

1. Flip this plan's overview status to `completed`. Update `updated:`.
2. Print: *"Validation walked clean. `<N>` automated, `<M>` manual workflows, `<P>` prereqs confirmed."*
3. Read this plan's `linked_design:` frontmatter to find the parent design.
4. Prompt: *"Flip design `[[...]]` to `completed` too?"* User picks. Default no — `approved` is the operational signal; `completed` is a formal close.

**Linkage discipline:**
- If `linked_design:` points to a design that doesn't exist, surface as a warning — don't silently drop.
- A design has exactly one plan (`linked_plan:`); there is no sibling-plan graph to walk.

## What `/c-validate` doesn't do

- Doesn't write code.
- Doesn't deploy.
- Doesn't modify plan or design content other than checkboxes and status.
- Doesn't run `/c-execute` on failure — escalation is to the user.
- Doesn't auto-flip the linked design's status without user confirmation.

## References

- Design source: [[designs/2026-05-17-cadence/06-validate]].
- Plan structure spec (where 96-validation lives): [[designs/2026-05-17-cadence/03-plan]].
