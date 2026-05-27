---
name: c-plan
description: Takes an approved design and writes an AI-readable plan folder with the same slug. Plans are exact paths, exact diffs, exact commands — no narrative. One design always becomes one plan; phase docs handle decomposition. Bidirectional linkage: writes `linked_design:` on the new plan and `linked_plan:` (singular) on the design. Never writes code; never auto-executes.
---

# `/c-plan`

You translate an approved design into an execution-ordered plan folder. Plans are written for AI, not humans — terse, exact, no padding.

## Entry contract

**Requires:** `<paths.designs>/{yyyy-mm-dd-slug}/00-overview.md` with `status: approved`. Read the entire design folder (overview + every child + 99-OOS) before drafting.

**Refuses when:** design status is `draft` or `in-review` (tell user to finish/approve the design first); or when a plan folder with the same slug already exists at non-draft status (would overwrite).

## One design → one plan

A design always becomes exactly **one** plan folder. Work that would once have been separate plans becomes **phase docs** (`01-<phase>.md`, `02-<phase>.md`, …) inside that one plan. There is no split question and no `linked_plans:` array. After reading the design, confirm the **phase decomposition** with the user (writing-flow step 3); do not ask about splitting into multiple plans.

Size is handled by phase decomposition, not by spawning sibling plans — `/c-execute`'s DAG engine already parallelizes across phase docs.

## Bidirectional linkage

- Plan's `00-overview.md` carries `linked_design: <design-slug>`.
- Set the design's `linked_plan: <this-plan-slug>` (singular). Update the design's `updated:` date.
- The design flips to `completed` only when its `linked_plan` reaches status `completed` (gated by `/c-validate`).

## Folder layout

```
<paths.plans>/
  {yyyy-mm-dd-slug}/
    00-overview.md
    01-<phase>.md, 02-…    # execution order
    96-validation.md       # the three-category doc
    97-infrastructure-inventory.md   # SHELL — wikilink to design's 97
    98-architecture-diagrams.md      # SHELL — wikilink to design's 98
    99-out-of-scope.md
```

## `00-overview.md` required sections (in this order)

- Frontmatter per `skills/_shared/frontmatter.md`.
- Agentic worker header: `> For agentic workers: REQUIRED SUB-SKILL: Use /c-execute …`
- **Goal** — one sentence.
- **Architecture** — 2-3 sentences linking back to the design.
- **Tech Stack** — one line.
- **Design link** — `[[../../designs/{slug}/00-overview]]`.
- **Plan Index** — one line per child: `[[01-foo]] — Tasks 1.1-1.M: <summary>`.
- **File Map** — every file the plan creates or modifies, one line per file, with the change summary.

No "Background," "Why," or plain-English. Those live in the design.

## Task structure (every task, every phase doc)

````````markdown
### Task N.M: <Name>

**Reads:** [`exact/path/context`]      <!-- context files, read not written -->
**Touches:** [`exact/path/written`]     <!-- every file this task writes (incl. created files + tests) -->
**Depends:** [N.K]                      <!-- task ids that must merge first; [] if independent -->

- [ ] **Step 1: Write failing test**
  ```python
  def test_specific_behavior():
      ...
  ```

- [ ] **Step 2: Run test, expect FAIL**
  `pytest tests/exact/path.py::test_specific_behavior -v`
  Expected: FAIL — `<exact message>`

- [ ] **Step 3: Implement**
  ```python
  def function(...):
      ...
  ```

- [ ] **Step 4: Run test, expect PASS**
  `pytest tests/exact/path.py::test_specific_behavior -v`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add tests/exact/path.py src/exact/path.py
  git commit -m "feat: <message>"
  ```
````````

## Plan content rules

- Every step is one action (2-5 minutes of work).
- Every code step shows the FULL code — no `// implement here` placeholders.
- No cross-references like "similar to Task N" — repeat code inline.
- Every run-command step shows the exact command and expected output/status.
- Every task ends with a commit step (cadence: per task).
- **Banned phrases:** `TBD`, `TODO`, `add error handling`, `fill in details`, `handle edge cases`, `write tests for the above`. Plan failures; block self-review.
- **`Reads:`/`Touches:`/`Depends:` required** on every task. `Touches:` must name every file the task writes (the `/c-execute` co-scheduling guard depends on it). `Depends:` lists task ids that must merge first (`[]` = independent). The former per-task concurrency marker is superseded by these three fields.

**TDD default; opt-out in config.** `config.plan.tdd: true` → test → fail → impl → pass → commit. `false` → impl → run → commit (test steps omitted).

## Codebase verification (mandatory)

Every file path, line range, symbol, and import a plan cites must be ground-truthed against the current code BEFORE it lands in the plan. Imagined APIs are the single biggest cost in `/c-execute` — implementers burn ~30-40% of each dispatch rediscovering what the planner could have grepped for once. Pay it here.

**What to verify, how:**

- **`Modify` and `Test` file paths** — `ls` or Read each. If a file doesn't exist, fix the path or move the entry to `Create`.
- **Line ranges (`file.py:120-145`)** — Read that range. Confirm it contains what the task assumes; stale ranges drift fast.
- **Symbols in code snippets** — function names, class names, methods, attributes, properties. Grep for each. If the design says `cost_query_function` but the real form is `self.api_construct.cost_query_function`, cite the real form.
- **Import paths** — every `from X import Y` resolves to a real module. Grep `X` to confirm the module exists; check `Y` is exported.
- **Codebase conventions** — when introducing an import or pattern, check how the codebase already does it (`lambda_` vs `_lambda`, `Column` vs `Mapped`, etc.). Follow the existing convention.

**When in doubt, Read the file.** A planner guess is worse than a planner question.

**What this isn't:** type-checking your snippets. You're not verifying the new code compiles — that's the implementer's job. You're verifying that the names, paths, and imports you hand the implementer correspond to things that already exist.

**Defense in depth:** `/c-audit`'s `code-behind-checkbox` audit still runs at completion as a backstop. This upstream verification is primary; the audit catches anything that slipped through.

## `96-validation.md` — three explicit categories

Walked by `/c-validate` only after the plan is `implemented` and the user has deployed. Three required sections:

- **A. Automated** — Claude runs each: `curl`, `psql`, `pytest`, etc. Expected value/shape; broken-if signal.
- **B. Manual workflow** — User clicks; Claude verifies after each step via DB/API.
- **C. Prerequisites** — User does before Claude can test (deploy, fixtures, keys). Walk blocks until all C confirmed.

Every entry gets `- [ ]`. `/c-validate` checks them off as it walks.

## `97` / `98` shells

Each is a single `> [!note] Reference shell` block pointing back to the design's matching doc. Same shape for 97 and 98. If the design omitted 97/98 (opt-in not taken), the shell still creates with a pointer to the design's overview.

## `99-out-of-scope.md` (plan-side)

Initial content is a shell — wikilink to design's 99-OOS and "(No entries yet.)" Entries land when `/c-plan` Q&A surfaces a cut OR `/c-execute` mark-out-of-scope is invoked.

## Writing flow

1. Read approved design end-to-end (overview + every child + 99-OOS).
2. Confirm phase decomposition (no split question — one plan always): *"Plan files will be `01-schema`, `02-pipeline`, `03-api`, `04-frontend`. Sound right?"*
3. Write `00-overview.md` first (frontmatter + phase index + File Map — generators need it).
4. Dispatch one fresh generator agent per remaining doc (phase docs, `96-validation`, `97`/`98` shells, `99-out-of-scope`) **in parallel**, up to `authoring.max_parallel`. Before each generator finalizes its doc, run the codebase verification pass (above) on every path, symbol, and import it cites. Fix inline.
5. **Invariant 2 in reverse.** If a phase reveals a gap or inconsistency in the design, surface it. Apply drift policy (default: update plan only; user-elective: update plan + design).
6. Dispatch `cadence-doc-consistency` once over the full set. Reconcile trivial wording; surface substantive contradictions to the user via `AskUserQuestion`. Re-dispatch only affected generators on resolution. The plan is not finalized until the sweep is clean.
7. **Bidirectional linkage write.** Set design's `linked_plan:` to this plan's slug (singular). Bump design's `updated:`.
8. **Self-review pass** (see below).
9. Status stays `draft`. Print: *"Plan written. Run `/c-execute <path>` when ready."*

## Generation (always batched)

Plan docs are mechanical, so `/c-plan` always batches generation (no one-by-one mode):
1. Write `00-overview.md` first (frontmatter + phase index + File Map — generators need it).
2. Dispatch one fresh generator agent per remaining doc (phase docs, `96-validation`, `97`/`98` shells, `99-out-of-scope`) **in parallel**, up to `authoring.max_parallel`. Each generator gets the approved design (or relevant slice), the plan overview, its doc's scope, and the format conventions.
3. Dispatch `cadence-doc-consistency` once over the full set. Reconcile trivial wording; surface substantive contradictions to the user via `AskUserQuestion`. Re-dispatch only affected generators on resolution.
4. The plan is not finalized until the sweep is clean.

## Self-review pass

1. **Placeholder scan** — no banned phrases (`TBD`, `TODO`, `implement here`, `similar to Task N`, `add validation`).
2. **Task shape** — every task has `Reads:`, `Touches:`, and `Depends:` fields, ≥3 steps, and a final commit step; every `Touches:` entry is a real path; every `Depends:` id references a real task.
3. **Code completeness** — every code step has actual code, not a stub.
4. **Command completeness** — every run-command step has exact command + expected output.
5. **Symbol/path/import verification** — every cited file path, line range, symbol, and import was ground-truthed against the current code per "Codebase verification" rules. Intra-plan consistency also holds: names referenced across later tasks match earlier ones. (`/c-audit`'s `code-behind-checkbox` audit remains a backstop at completion.)
6. **File Map honesty** — every file in tasks appears in File Map; nothing in File Map is missing from tasks.
7. **Wikilink integrity** — every `[[…]]` resolves.

Fix inline. No re-review needed.

## What `/c-plan` doesn't do

- Doesn't write code.
- Doesn't modify the design (already approved). Exception: drift handling "update plan + design" path with user opt-in.
- Doesn't run anything.
- Doesn't auto-execute. `/c-execute` is separately invoked.

## References

- Design source: [[designs/2026-05-17-cadence/03-plan]].
- Shared frontmatter: `skills/_shared/frontmatter.md`.
- Shared format: `skills/_shared/obsidian-format.md`.
