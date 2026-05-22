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

**1. Category C — Prerequisites first.** Read section C, print the prereq list, ask user to confirm each: *"Backend deployed? Migration run? Test users seeded? (y/each)"* Walk BLOCKS until every C item confirmed. No prereq = no validation.

**2. Category A — Automated.** Run each item itself: `curl`, `psql`, `pytest`, etc. Mark `- [x]` as each passes. Stop on first failure; surface exact output for user resolution.

**3. Category B — Manual workflow last.** For each walkthrough:
- Print the human-readable step list ("Log in as X → click Y → see Z").
- User does the clicks.
- Run the verification (DB query or API call) after each step or at walkthrough's end.
- Mark `- [x]` when verified.

## Tracking

- Every entry in A/B/C carries `- [ ]` at plan-write time.
- Check them off as you walk.
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
