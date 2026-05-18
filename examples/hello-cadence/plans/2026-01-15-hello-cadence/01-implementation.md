---
title: "Plan — Hello-Cadence Phase 01: implementation"
---

# Phase 01 — Implementation

Build the module + test in two bite-sized tasks. TDD shape: test first, then implementation.

### Task 1.1: Failing test for `current_time_iso()`

**Files:**
- Create: `pyproject.toml`
- Create: `src/hello_cadence/__init__.py`
- Create: `tests/test_now.py`

**Parallel:** independent

- [x] **Step 1: Write `pyproject.toml`**

  ```toml
  [project]
  name = "hello-cadence"
  version = "0.1.0"
  requires-python = ">=3.12"

  [tool.pytest.ini_options]
  pythonpath = ["src"]
  testpaths = ["tests"]
  ```

- [x] **Step 2: Write `src/hello_cadence/__init__.py`** (empty file)

  Run: `touch src/hello_cadence/__init__.py`

- [x] **Step 3: Write `tests/test_now.py`**

  ```python
  import re
  from hello_cadence.now import current_time_iso

  def test_current_time_iso_matches_pattern():
      result = current_time_iso()
      assert re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$", result)
  ```

- [x] **Step 4: Run test, expect FAIL**

  Run: `pytest tests/test_now.py -v`
  Expected: FAIL — `ImportError: cannot import name 'current_time_iso' from 'hello_cadence.now'` (or `ModuleNotFoundError`, since `now.py` doesn't exist yet).

- [x] **Step 5: Commit**

  ```bash
  git add pyproject.toml src/hello_cadence/__init__.py tests/test_now.py
  git commit -m "test: failing test for current_time_iso pattern"
  ```

### Task 1.2: Implement `current_time_iso()`

**Files:**
- Create: `src/hello_cadence/now.py`

**Parallel:** depends on 1.1

- [x] **Step 1: Write implementation**

  ```python
  import datetime

  def current_time_iso() -> str:
      return datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

  if __name__ == "__main__":
      print(current_time_iso())
  ```

- [x] **Step 2: Run test, expect PASS**

  Run: `pytest tests/test_now.py -v`
  Expected: PASS.

- [x] **Step 3: Smoke-run the module**

  Run: `python -m hello_cadence.now`
  Expected: a single line matching `YYYY-MM-DDTHH:MM:SSZ`.

- [x] **Step 4: Commit**

  ```bash
  git add src/hello_cadence/now.py
  git commit -m "feat: current_time_iso returns UTC ISO 8601"
  ```
