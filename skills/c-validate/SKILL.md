---
name: c-validate
description: Walks a plan's 96-validation.md post-deploy. Category C (prereqs) first, then A (automated), then B (manual workflow). Checks off items as it walks. On a full pass, flips the plan to `completed`, then flips the linked design to `completed` in the same step (no prompt).
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

**1. Category C — Prerequisites first.** Read the plan's `96-validation` once via `skills/_shared/storage-resolution.md` (read_artifact); for section C print the prereq list, ask user to confirm each: *"Backend deployed? Migration run? Test users seeded? (y/each)"* Walk BLOCKS until every C item confirmed. No prereq = no validation.

**2. Category A — Automated.** Run each item itself: `curl`, `psql`, `pytest`, etc. Mark `- [x]` as each passes. Stop on first failure; surface exact output for user resolution.

**3. Category B — Manual workflow last.** Resolve `validate.browser_driver` to delegate-or-manual **once** at the start of this pass, per `skills/_shared/browser-validation.md` (`auto` runs suite detection and delegates if found; `playwright` forces delegation; `manual` forces manual). Then, for each Category B item:
- **If the driver resolved to delegate AND the item carries an `e2e:` line → delegate.** Compose `<browser_env_preamble> && <browser_command> <spec> -g "<grep>"` (drop the `&& ` prefix if no preamble; drop `-g` if the item has none), run it headless and non-interactively, and map the exit code: **exit 0 → mark `- [x]`**; **non-zero → a validation failure**, routed through the existing **Failure handling** section below (stop the walk, surface exact output, offer Fix / OOS / Abort). No new failure path.
- **Otherwise → manual (today's behavior).** Print the human-readable step list ("Log in as X → click Y → see Z"); user does the clicks; run the verification (DB query or API call) after each step or at walkthrough's end; mark `- [x]` when verified.

The C→A→B order is unchanged, and Tracking's checkpoint-before-yield flush applies to delegated and manual items alike: a passing item's `- [x]` is written to `96-validation.md` before control leaves you.

## Tracking

- Every entry in A/B/C carries `- [ ]` at plan-write time.
- Check them off as you walk: every `- [x]` mark in Categories A, B, and C (above) is performed per `skills/_shared/storage-resolution.md` (tick), which rewrites the markdown checkbox on the filesystem backend and checks the to-do block on the notion backend.
- **Checkpoint before yielding.** Follow `skills/_shared/progress-checkpoint.md`: confirm each item's tick has landed the moment its check passes, and flush every passed item BEFORE pausing — before asking the user to do a Category B manual step, before a clarifying question, and before stopping on a Category A failure. The just-passed checks must be durable before control leaves you, or a context loss reruns them.
- On re-runs (status already `completed`), clear the checkboxes with a tick-clearing pass per `skills/_shared/storage-resolution.md` (tick), gated by `config.validate.reset_checkboxes_on_rerun` (default `true`).

## Failure handling

| Response | Effect |
|---|---|
| **Fix and retry** | Walk pauses. User (or PM) addresses failure. Resume from failed item. |
| **OOS** | Failure represents work never going to be tested this round. Move entry to plan-side `99-out-of-scope.md` with rationale; remove from 96; continue walk. |
| **Abort** | Status stays at `implemented`. Surface what's broken. User comes back later. |

Status NEVER advances to `completed` with any unchecked 96 item. No silent passes.

## On full pass

1. Set this plan's overview status to `completed` per `skills/_shared/storage-resolution.md` (set_status), which bumps `updated:`.
2. Find the parent design through the design↔plan link: the plan overview already read via `skills/_shared/storage-resolution.md` (read_artifact) carries the link, and the design is then resolved via (resolve) — never by reading a raw `linked_design:` frontmatter line.
3. Flip the design to `completed` in the same step, via `skills/_shared/storage-resolution.md` (set_status). No prompt: a full pass closes the plan and its design together. Only an `approved` design flips (the transition in `skills/_shared/frontmatter.md`). A design already `completed` (a re-validation) is left as is; any other status is surfaced as a warning and left unchanged.
4. Print: *"Validation walked clean. `<N>` automated, `<M>` manual workflows, `<P>` prereqs confirmed. Plan and design `[[...]]` flipped to `completed`."* When step 3 didn't flip the design, replace the last sentence with what happened instead (plan flipped; design already `completed`, left at `<status>`, or not found).

**Linkage discipline:**
- If `linked_design:` points to a design that doesn't exist, surface as a warning — don't silently drop.
- A design has exactly one plan (`linked_plan:`); there is no sibling-plan graph to walk.

## What `/c-validate` doesn't do

- Doesn't write code.
- Doesn't deploy.
- Doesn't modify plan or design content other than checkboxes and status.
- Doesn't run `/c-execute` on failure — escalation is to the user.
- Doesn't flip the linked design on anything short of a full pass.

## References

- Plan structure spec (where 96-validation lives): `skills/c-plan/SKILL.md`.
