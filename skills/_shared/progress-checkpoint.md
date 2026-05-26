# Progress checkpointing (shared by /c-execute and /c-validate)

How Cadence keeps on-disk checkbox state honest across context loss. The doc on disk is the only memory a re-invoked or resumed session has — anything held only "in your head" is lost the moment the session pauses, dies, or compacts. This invariant makes the file the durable record of what's actually done.

## The invariant

**Persist each `- [x]` to the doc the moment its check passes — and ALWAYS flush every completed checkbox to disk BEFORE yielding control.** Yielding control means any of:

- Asking the user a question (clarification, drift, confirmation).
- Handing off a manual step the user must perform (e.g. a `/c-validate` Category B click-through).
- Stopping on a failed check to surface output.
- Entering a block/quiesce state.

Never batch the writes until "the end." Never carry a passed-but-unmarked check through a pause. The rule is checkpoint-then-yield, in that order.

## Why

A paused session can lose its in-memory state for reasons outside its control (the user walks away and the context compacts, the session is killed, a manual step takes hours). When that happens, the next session rebuilds progress **only** from the checkboxes on disk. A check that passed but was never written is indistinguishable from one that never ran — it gets redone at best, silently skipped at worst.

## Persist vs. commit

This invariant is about **writing to the file**, not about git commits. Saving the edited doc is enough to survive a context loss — a resumed session reads the working file regardless of commit state. Each consuming skill keeps its own commit-timing rule (`/c-execute` commits all plan-file edits once at the end; `/c-validate` per its own rules). Checkpointing to disk happens continuously; committing happens on the skill's own schedule.
