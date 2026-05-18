---
title: Hello-Cadence — Current Time Printer
created: 2026-01-15
updated: 2026-01-15
status: approved
tags: [design, hello-cadence, example]
linked_plans:
  - 2026-01-15-hello-cadence
---

# Hello-Cadence — Current Time Printer

## What we're building

A tiny Python module `hello_cadence.now` exposing one function `current_time_iso()` that returns the current UTC time as an ISO 8601 string (e.g. `2026-01-15T14:30:00Z`). Plus a `__main__` entry so `python -m hello_cadence.now` prints it.

## Why

This is the canonical Cadence worked example. It exists so first-time Cadence users can read a complete design + plan end-to-end and see what "done" looks like. Real users should not copy this feature into their own projects — it's structurally a teaching artifact.

## Approach

Single Python module (`src/hello_cadence/now.py`), single function, single test. No CLI library, no config file, no logging. The function uses `datetime.datetime.now(datetime.UTC)` (not the deprecated `utcnow()`) and ISO 8601 formats with the `Z` suffix.

## Doc index

- [[00a-plain-english]] — Narrative tour.
- [[01-implementation]] — Function signature, test cases, edge cases.
- [[99-out-of-scope]] — What this example deliberately doesn't do.

## Decisions log

> [!success] Decision: Use `datetime.UTC` not `utcnow()`
> `datetime.utcnow()` is deprecated (Python 3.12+ warns; 3.14+ removes). Use `datetime.datetime.now(datetime.UTC)`. Rationale: avoid the deprecated path so the example doesn't teach bad habits.

> [!success] Decision: ISO 8601 with `Z` suffix, no microseconds
> Output format: `YYYY-MM-DDTHH:MM:SSZ`. Rationale: human-readable, sorts lexicographically, no microsecond noise for an example.

> [!success] Decision: No CLI library
> Use `if __name__ == "__main__": print(current_time_iso())`. Rationale: example demonstrates Cadence, not argparse.

## Out of scope

See [[99-out-of-scope]] for the canonical list.
