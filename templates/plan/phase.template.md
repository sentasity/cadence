---
title: "Plan — <FEATURE_TITLE> Phase NN: <PHASE_NAME>"
---

# Phase NN — <PHASE_NAME>

<One paragraph: what this phase produces and how it ties to the next phase.>

### Task N.M: <Task Name>

**Files:**
- Create: `<exact/path/to/new>`
- Modify: `<exact/path/to/existing>:<line-range>`
- Test: `<exact/path/to/test>`

**Parallel:** independent | depends on N.K

- [ ] **Step 1: Write failing test**

  ```python
  def test_specific_behavior():
      ...
  ```

- [ ] **Step 2: Run test, expect FAIL**

  Run: `pytest <test-path>::test_specific_behavior -v`
  Expected: FAIL — `<exact error message>`.

- [ ] **Step 3: Implement**

  ```python
  def function(...):
      ...
  ```

- [ ] **Step 4: Run test, expect PASS**

  Run: `pytest <test-path>::test_specific_behavior -v`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add <files>
  git commit -m "<conventional message>"
  ```

<Repeat task block per task. For non-TDD plans (config.plan.tdd: false),
 omit Steps 1, 2, 4 — pattern becomes Implement → Run → Commit.>
