---
title: "Plan — Hello-Cadence — Validation"
---

# Validation — Hello-Cadence

Walked by `/c-validate` after the plan is `implemented`. There's no deployment for this example (it's a Python library), so validation is mostly automated.

## C. Prerequisites (you do before Claude can test)

- [x] **Prereq 1: Package installed in dev mode**
  - What: `pip install -e .` from the example's root.
  - Why: pytest needs to import `hello_cadence` from the source.
  - Done when: `pip show hello-cadence` returns metadata.

## A. Automated (Claude runs end-to-end)

- [x] **Test 1: pytest passes**
  - Run: `pytest tests/ -v`
  - Expected: `1 passed`.
  - Broken if: pattern test fails or import error.

- [x] **Test 2: Module CLI prints a valid ISO string**
  - Run: `python -m hello_cadence.now | grep -E "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$"`
  - Expected: a single line matching the pattern.
  - Broken if: no output, or output doesn't match the regex.

## B. Manual workflow (you click, Claude verifies)

- [x] **Walkthrough 1: Read the design + plan end-to-end as a first-time user**
  - Log in as: yourself, with no prior Cadence context.
  - Steps:
    1. Open `examples/hello-cadence/designs/2026-01-15-hello-cadence/00-overview.md`. Read.
    2. Open `00a-plain-english.md`. Read.
    3. Open `01-implementation.md`. Read.
    4. Open `99-out-of-scope.md`. Read.
    5. Open the plan's `00-overview.md`. Read.
    6. Open `01-implementation.md`. Read.
    7. Open `96-validation.md` (this file). Read.
  - Claude verifies (after step 7): user can summarize back: what the feature does, why ISO 8601, what's out of scope, and what a Cadence plan task looks like.
  - Broken if: user finds the docs confusing, the conventions unclear, or the example too dense to follow in <10 minutes.
