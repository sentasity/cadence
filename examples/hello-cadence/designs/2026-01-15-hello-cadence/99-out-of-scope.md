---
title: Hello-Cadence — Out of Scope
---

# Out of Scope

## 1. Local-timezone output

**What:** Returning the time in the user's local timezone (or letting the user pick).

**Why:** Out of scope because ISO 8601 UTC is unambiguous; local-time output is the road to "but it's the wrong hour for my user" bugs. Rejected explicitly during the design.

**Surfaced in:** [[00-overview#Decisions log]] — ISO 8601 with `Z` suffix decision.

## 2. Configurable format string

**What:** Letting the caller pass a format string (e.g. `current_time_iso(fmt="%Y-%m-%d")`).

**Why:** Out of scope — the example shows what a tiny pure function looks like under Cadence. Configurability adds surface area without teaching anything about Cadence.

**Surfaced in:** [[00-overview#Decisions log]].

## 3. CLI flags

**What:** Adding `argparse` or `click` to the `__main__` entry.

**Why:** Out of scope — the example demonstrates Cadence, not Python CLI libraries.

**Surfaced in:** [[00-overview#Decisions log]] — "No CLI library" decision.
