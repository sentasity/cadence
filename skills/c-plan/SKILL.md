---
name: c-plan
description: Takes an approved design and writes an AI-readable plan folder with the same slug. Plans are exact paths, exact diffs, exact commands — no narrative. One design always becomes one plan; phase docs handle decomposition. Bidirectional linkage: writes `linked_design:` on the new plan and `linked_plan:` (singular) on the design. Never writes code; never auto-executes.
---

# `/c-plan`

You translate an approved design into an execution-ordered plan folder. Plans are written for AI, not humans — terse, exact, no padding.

## Entry contract

**Requires:** the design artifact for `{yyyy-mm-dd-slug}` with `status: approved`. Read the entire design (overview + every child + 99-OOS) via `skills/_shared/storage-resolution.md` (read_artifact) before drafting; do not assume a `<paths.designs>/…` folder path.

**Refuses when:** design status is `draft` or `in-review` (tell user to finish/approve the design first); or when a plan artifact with the same slug already exists at non-draft status — check via `skills/_shared/storage-resolution.md` (artifact_exists) — which would overwrite.

## One design → one plan

A design always becomes exactly **one** plan folder. Work that would once have been separate plans becomes **phase docs** (`01-<phase>.md`, `02-<phase>.md`, …) inside that one plan. There is no split question and no `linked_plans:` array. After reading the design, confirm the **phase decomposition** with the user (writing-flow step 3); do not ask about splitting into multiple plans.

Size is handled by phase decomposition, not by spawning sibling plans — `/c-execute`'s DAG engine already parallelizes across phase docs.

### Phase file sizing — fewer, coherent files

Each phase file becomes the unit of worktree dispatch and the unit of per-lane review under `/c-execute`'s lane = phase file rule (`docs/designs/2026-05-28-lane-by-phase-file/01-execution-engine-change.md`). Consolidate related work into fewer, larger phase files:

- **One substantive topic per file.** A topic is a coherent slice the reviewer can hold in their head — closely-related codebase slice (one skill, one service, one feature surface), shared `Reads:` core across tasks, a one-sentence reviewer headline with no "and also" clauses, and an internal DAG shape (chain, fan-out, fan-in — not fully disconnected).
- **Target 5–10+ tasks per file.** Below 5 is too thin to amortize worktree spin-up + per-lane review. 10+ is fine as long as topical coherence holds. The 5–10+ figure is a **target, not a threshold** — a genuinely 3-task plan still ships as a 3-task phase file.
- **Task size inside a phase file is unchanged.** The per-task contract (`Reads:`/`Touches:`/`Depends:`/`Steps`, every step one action, every code step shows the FULL code) is exactly today's rule. Consolidation is at the file level, not the task level.

**Worked example (positive exemplar).** `docs/plans/2026-05-26-c-validate-browser-automation/01-browser-validation.md` is the canonical good shape: 5 tasks (`1.1` config keys → `1.2` shared spec → `{1.3, 1.4, 1.5}` per-skill integration), one substantive topic (browser validation), shared `Reads:` core across all five (the `2026-05-26-c-validate-browser-automation` design docs), classic setup-then-fan-out DAG. Under the new rule this file is one warm lane.

**Three anti-patterns to detect.** Each is a way the new stance can fail in the wild. Flag candidates to the user via `AskUserQuestion`; never auto-merge or auto-split silently.

- **Mixed-topic file.** One phase file whose tasks span more than one coherent topic. Symptoms: tasks touch unrelated codebase slices; pairwise `Reads:` overlap is zero; the reviewer's one-sentence headline requires "and" to cover the file's diff; the file's name is generic ("foundation", "miscellaneous setup"). Correct response: split at the topic boundary. Do not pad the title to umbrella both topics; do not manufacture `Depends:` between unrelated tasks to fake cohesion.
- **Sprawling monolith.** One phase file with 20+ tasks where coherence is loose — several distinct sub-topics are visible inside (e.g. "Refactor the auth service" covering schema migration, middleware rewrite, and provider-integration tests). The internal DAG often shows near-disconnected subgraphs. Correct response: split at the strongest internal topic boundary — usually the one that produces the cleanest combined diff per resulting file.
- **Fragmented file.** A phase file with 1–2 tasks where related tasks live in sibling phase files that share its topic. Symptoms: `Reads:` overlaps heavily with a sibling's (>50% by either side's union); the headlines are near-duplicates; a reviewer would pull up both files together; the internal DAG is trivially short. Correct response: consolidate — merge into the sibling, or merge several fragments into one new file. This is the most common failure mode the new stance directly targets. A "setup-only" phase file (one or two tasks whose only purpose is to scaffold for the next file) is a subtler form of this anti-pattern: the setup belongs in the consuming file as the foundation tasks of its internal DAG.

## Bidirectional linkage

- Establish the design↔plan link with a single call to `skills/_shared/storage-resolution.md` (link): it is bidirectional and idempotent, setting `linked_design` on the plan and `linked_plan` (singular) on the design in one step and bumping the design's `updated:`. Do not write the two `linked_*` frontmatter keys by hand.
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
- **B. Manual workflow** — User clicks; Claude verifies after each step via DB/API. **Optional `e2e:` reference:** when you can identify a Playwright spec (and optional grep/tag) that exercises a Category B flow — drawn from the design and the repo's existing `tests/e2e/` specs — append an indented `e2e: <spec> -g "<grep>"` sub-line beneath that item's checkbox so `/c-validate` can run it headless (grammar in `skills/_shared/browser-validation.md`). The cited spec path is subject to the **"Codebase verification (mandatory)"** rule above — ground-truth it against the repo before it lands, the same as any `Touches:`/`Reads:` path. When no relevant spec exists, write a plain manual step (no `e2e:` line) — attaching a reference is opportunistic, never mandatory, and never breaks the plain-manual path.
- **C. Prerequisites** — User does before Claude can test (deploy, fixtures, keys). Walk blocks until all C confirmed.

Every entry gets `- [ ]`. `/c-validate` checks them off as it walks.

## `97` / `98` shells

Each is a single `> [!note] Reference shell` block pointing back to the design's matching doc. Same shape for 97 and 98. If the design omitted 97/98 (opt-in not taken), the shell still creates with a pointer to the design's overview.

## `99-out-of-scope.md` (plan-side)

Initial content is a shell — wikilink to design's 99-OOS and "(No entries yet.)" Entries land when `/c-plan` Q&A surfaces a cut OR `/c-execute` mark-out-of-scope is invoked.

## Writing flow

1. Read approved design end-to-end (overview + every child + 99-OOS).
2. Confirm phase decomposition (no split question — one plan always). Decompose into the **minimal coherent grouping** that covers the design — prefer one substantive topic per phase file (5–10+ tasks per file), not one phase file per design child-doc. A phase file is the unit of worktree dispatch and per-lane review under `/c-execute`'s lane = phase file rule; fragmented files create cold-start churn without parallelism gain. Confirm with the user: *"Plan files will be `01-<topic>`, `02-<topic>`, …. Sound right?"*
3. Create the plan artifact first via `skills/_shared/storage-resolution.md` (create_artifact), writing the `00-overview` (frontmatter + phase index + File Map — generators need it) with `base_sha` initialized empty; do not path-compute `<paths.plans>/…/00-overview.md`.
4. Dispatch one fresh generator agent per remaining doc (phase docs, `96-validation`, `97`/`98` shells, `99-out-of-scope`) **in parallel**, up to `authoring.max_parallel`; each generated doc is written to its slot per `skills/_shared/storage-resolution.md` (write_doc), never to a hand-computed `<paths.plans>/…` file. Before each generator finalizes its doc, run the codebase verification pass (above) on every path, symbol, and import it cites. Fix inline.
5. **Invariant 2 in reverse.** If a phase reveals a gap or inconsistency in the design, surface it. Apply drift policy (default: update plan only; user-elective: update plan + design).
6. Dispatch `cadence-doc-consistency` once over the full set. Reconcile trivial wording; surface substantive contradictions to the user via `AskUserQuestion`. Re-dispatch only affected generators on resolution. The plan is not finalized until the sweep is clean.
7. **Bidirectional linkage write.** Establish the design↔plan link via `skills/_shared/storage-resolution.md` (link) — one idempotent call sets `linked_plan` on the design and `linked_design` on the plan and bumps the design's `updated:`.
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
8. **Fragmented-file detector** — flag any phase file with 1–2 tasks whose `Reads:` core overlaps a sibling phase file's by >50% (candidate for consolidation). Surface to the user via `AskUserQuestion`; never auto-merge.
9. **Mixed-topic detector** — flag any phase file whose tasks pairwise share zero `Reads:` (candidate-multi-topic). Surface to the user via `AskUserQuestion`; never auto-split.

Fix items 1–7 inline. For items 8 and 9, surface candidates to the user — consolidate / split / leave-as-is is the user's call, not `/c-plan`'s. No re-review needed.

## What `/c-plan` doesn't do

- Doesn't write code.
- Doesn't modify the design (already approved). Exception: drift handling "update plan + design" path with user opt-in.
- Doesn't run anything.
- Doesn't auto-execute. `/c-execute` is separately invoked.

## References

- Design source: [[designs/2026-05-17-cadence/03-plan]].
- Shared frontmatter: `skills/_shared/frontmatter.md`.
- Shared format: `skills/_shared/obsidian-format.md`.
