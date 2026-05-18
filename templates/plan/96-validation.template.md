---
title: "Plan — <FEATURE_TITLE> — Validation"
---

# Validation

Walked by `/c-validate` only after the plan is `implemented` and the user has deployed. Three required categories.

## A. Automated (Claude runs end-to-end)

- [ ] Test 1: <name>
  - Run: `<curl … | jq … | OR psql -c '…' | OR pytest …>`
  - Expected: <exact value or shape>
  - Broken if: <signal>

## B. Manual workflow (you click, Claude verifies)

- [ ] Walkthrough 1: <name>
  - Log in as: <test user>
  - Steps: 1) Go to **Page** → 2) Click **Button** → 3) See **State**
  - Claude verifies: <DB query or API call after each step>
  - Broken if: <signal>

## C. Prerequisites (you do before Claude can test)

- [ ] Prereq 1: <name>
  - What: <e.g. deploy backend, populate fixtures, rotate keys>
  - Why: <one line>
  - Done when: <observable signal>
