---
title: Hello-Cadence — Plain English Walkthrough
---

# Hello-Cadence — Plain English Walkthrough

## What this feature does, in one paragraph

A Python module that prints the current time in a standard format. You install it, run `python -m hello_cadence.now`, and see the time. That's it. The point isn't the feature — it's to show you a complete Cadence design + plan for a feature small enough you can hold the whole thing in your head while you read.

## The normal cycle

You run `python -m hello_cadence.now`. The module imports `datetime`, asks the OS for the current UTC time, formats it as `YYYY-MM-DDTHH:MM:SSZ`, and prints it. Total runtime is a few microseconds.

## What the user sees

A single line of output:

```
2026-01-15T14:30:00Z
```

No flags, no config, no errors (other than ones the OS surfaces if the system clock is broken).

## What can go wrong

**Soft failures.** None. The function is pure and synchronous; if `datetime.now()` returns, it works.

**Hard failures.** If `datetime.now()` raises (e.g. on a system where the clock is unset), the exception propagates. The example doesn't catch it — that's the user's problem, not the library's.

## How we'll know it's working

Run the test: `pytest tests/test_now.py`. Run the module: `python -m hello_cadence.now`. The output should match the regex `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$`.

## Lifecycle diagram

```mermaid
flowchart LR
    A[User runs python -m hello_cadence.now] --> B[current_time_iso called]
    B --> C[datetime.now UTC]
    C --> D[strftime ISO format]
    D --> E[print to stdout]
```

## TL;DR

1. Tiny Python module — one function, one test.
2. Returns current UTC time as `YYYY-MM-DDTHH:MM:SSZ`.
3. No CLI library, no config, no logging.
4. Uses `datetime.UTC` (not deprecated `utcnow()`).
5. Exists as Cadence's worked example, not a real feature to depend on.
6. Read the [[00-overview]] and [[01-implementation]] for the technical detail.
