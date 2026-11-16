---
name: c-plan
description: Use when the user wants an implementation plan written from an approved Cadence design, or from any other source such as hand notes, a spec, or mockups plus a decisions list.
---

# `/c-plan`

You translate an approved design, or any other source document, into an execution-ordered plan folder. Plans are written for AI, not humans — terse, exact, no padding.

## Entry contract

Two forms:

- **`/c-plan <design-slug>`** — a Cadence design. **Requires** the design artifact with `status: approved`; read it whole (overview and every topic doc, including `00a`/`99` docs in older designs) via `skills/_shared/storage-resolution.md` (read_artifact), never by assumed path. With a `95-visual-contract` slot, also fetch the frozen mockup via read_mockup. **Refuses when** the design is `draft` or `in-review` (finish and approve it first), or its 95 freeze record still reads `frozen: none` (point back to `/c-design`'s approval step).
- **`/c-plan --from <file or folder>`** — any other source: hand notes, a spec, or HTML mockups plus a decisions list. Read every file in it (a folder: every text, markdown, and HTML file, recursively). No approval gate: the intake check below replaces it. The plan's slug is today's date plus a kebab slug of the source's title (or folder name).

**Both refuse** when a plan artifact with the same slug already exists at non-draft status — check via `skills/_shared/storage-resolution.md` (artifact_exists).

### Intake check (`--from` only)

Before drafting, check the source for four things and report each as found (with where) or missing:

1. **Goal** — what the work is for, in a sentence or two.
2. **Decisions** — the choices already made (a list, or decisions stated in the text).
3. **Behavior or visuals** — what it should do, or mockups that show it.
4. **Open questions listed** — the source names its open questions, or says there are none.

Anything missing, and every open question the source lists, goes to the user in one grouped `AskUserQuestion` per `skills/_shared/ask-user-question.md`: fill the gaps and answer the questions (each with a recommended answer), or stop. Never plan around an open question. The answers are recorded in the plan overview under `## Intake answers` and bind like the source.

Everywhere below, "the design" means the design or, for `--from`, the source and its intake answers.

## One source → one plan

A design (or a `--from` source) always becomes exactly **one** plan folder. Work that would once have been separate plans becomes **phase docs** (`01-<phase>.md`, `02-<phase>.md`, …) inside that one plan. There is no split question and no `linked_plans:` array. After reading the design, confirm the **phase decomposition** with the user (writing-flow step 2); do not ask about splitting into multiple plans.

Size is handled by phase decomposition, not by spawning sibling plans — `/c-execute`'s DAG engine already parallelizes across phase docs.

### Phase files are topics

A phase file groups the tasks of one coherent topic (one skill, one service, one feature surface) so a reader can follow the plan. It no longer sets how work is dispatched: `/c-execute` bundles ready tasks into lanes by word budget (`execute.bundle_words`), across files, so never split or merge a phase file for execution's sake. Split a file whose tasks span unrelated topics; merge a one- or two-task file into the sibling that shares its topic. The per-task contract (`Reads:`/`Touches:`/`Depends:`/steps) is unchanged.

## Linkage

- **From a design:** establish the design↔plan link with one call to `skills/_shared/storage-resolution.md` (link): bidirectional and idempotent, it sets `linked_design` on the plan and `linked_plan` on the design and bumps the design's `updated:`. Never write the `linked_*` keys by hand. `/c-validate` flips both to `completed` on a full validation pass.
- **From a source (`--from`):** no link call; `linked_design` stays `null`. The overview's `**Source:**` line lists the source files by absolute path. `/c-execute`, `/c-audit`, and `/c-validate` read that line where they would read the design.

## Plan style

`plan.style` (resolved config) picks what a plan's steps contain:

- `decisions` (default): steps record the decisions the implementer can't make alone and leave the code to them. See "Decision plans" below.
- `full-code`: every code step shows the full code. "Task structure" and "Plan content rules" below describe this style.
- `ask`: ask once per plan via `AskUserQuestion`, in writing-flow step 3 alongside the generation-mode question, with `decisions` marked `(Recommended)` (the shipped default).

Every new plan records its style in the overview as a `**Plan style:** full-code` or `**Plan style:** decisions` line directly after the Tech Stack line. That line, not config, is the plan's style for its whole life: `/c-execute` and its agents read it from the plan, so changing `plan.style` later never changes the rules under a plan already written. A plan with no style line (written before the line existed) is `full-code`.

The companion sections, "Global Constraints" and "Review Focus" below, apply to every plan whatever its style; `plan.style` gates only step content and the per-task Interfaces block.

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
- **Plan style** — `**Plan style:** full-code` or `**Plan style:** decisions`, directly after Tech Stack (see "Plan style").
- **Design link** — `[[../../designs/{slug}/00-overview]]`; for a `--from` plan, a **Source** line instead (`**Source:**` and the absolute path of each source file), plus a `## Intake answers` section when the intake check asked anything.
- **Global Constraints** — a `## Global Constraints` section, every plan (see "Global Constraints").
- **Review Focus** — a `## Review Focus` section, every plan (see "Review Focus").
- **Plan Index** — one line per child: `[[01-foo]] — Tasks 1.1-1.M: <summary>`.
- **File Map** — every file the plan creates or modifies, one line per file, with the change summary.
- **Surface map** — only when the linked design has a `95-visual-contract` slot, or the source has mockups: one line per surface declared in 95's Surfaces section, `<surface name>: <file list>`, mapping the surface to the concrete files that implement it, ground-truthed per "Codebase verification". Recording the mapping is what makes the visual `Reads:` attachment below machine-checkable.

No "Background," "Why," or plain-English. Those live in the design or the source.

## Task structure (every task, every phase doc)

This is the full-code shape. Decision plans keep the same fields and step sequence, add an `**Interfaces:**` field, and change what each step contains (see "Decision plans").

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

These rules apply to every plan, except the three marked *(full-code)*, which decision plans replace (see "Decision plans").

- *(full-code)* Every step is one action (2-5 minutes of work).
- *(full-code)* Every code step shows the FULL code — no `// implement here` placeholders.
- *(full-code)* No cross-references like "similar to Task N" — repeat code inline.
- Every run-command step shows the exact command and expected output/status.
- Every task ends with a commit step (cadence: per task).
- **Banned phrases:** `TBD`, `TODO`, `add error handling`, `fill in details`, `handle edge cases`, `write tests for the above`. Plan failures; block self-review.
- **`Reads:`/`Touches:`/`Depends:` required** on every task. `Touches:` must name every file the task writes (the `/c-execute` co-scheduling guard depends on it). `Depends:` lists task ids that must merge first (`[]` = independent). The former per-task concurrency marker is superseded by these three fields.

**TDD default; opt-out in config.** `config.plan.tdd: true` → test → fail → impl → pass → commit. `false` → impl → run → commit (test steps omitted).

## Decision plans

When the plan's style is `decisions`, the plan records the decisions the implementer cannot make alone and leaves the code to them. Write for an engineer who has not seen this codebase or this design, who writes idiomatic code in the project's language once they know the exact interface and the exact test, and who makes a reasonable choice wherever the plan leaves one open. What they cannot know is what was decided: which files, which names and signatures, which values from the design, which tests prove each task. Document those.

**A step is done when the implementer can write exactly one reasonable thing from it.** Unambiguous, not complete. Each kind of step carries what makes it unambiguous and nothing more:

| Step kind | Carries |
|---|---|
| Test step | The test's name and its assertions, as code, with the design's exact values in them. |
| Code step | The exact signature (name, parameters, return type), the file it lives in, and the values the design pins. A body only for an algorithm the signature and tests don't determine, or for exact copy the design fixes. One line on the approach when the signature and tests leave a real choice. |
| Verification step | The command and the output that means it passed (for the RED run, the expected failure). |
| Reference to another task | Through that task's Interfaces block. Never repeat another task's code. |
| Commit step | The files and the message. |

A plan longer than the code it describes has written the code instead. Lines that decide nothing (the banned phrases above, a type or function no task defines) are the opposite failure; self-review catches both.

**Step sizing:** one action with a checkable result (write the failing test; run it; implement the signature; run the tests; commit), not minutes.

**Interfaces block (required in decision plans, omitted in full-code plans).** Every task carries `**Interfaces:**` directly after `**Depends:**`, with two lines:

- `Consumes:` the exact signatures this task uses from other tasks, each tagged with the producing task id, or `none`.
- `Produces:` the exact signatures later tasks rely on, or `none`.

An implementer sees only its own task block and its `Reads:` files, so this block is the only place shared names travel. Every `Consumes:` entry must be produced by a task in the consumer's `Depends:` closure or already exist in the codebase (ground-truthed per "Codebase verification").

Task shape:

````markdown
### Task 2.3: Parse retry budget from config

**Reads:** [`src/config/loader.py`, `tests/config/test_loader.py`]
**Touches:** [`src/config/retry.py`, `tests/config/test_retry.py`]
**Depends:** [2.1]
**Interfaces:**
- Consumes: `load_section(name: str) -> dict` (Task 2.1)
- Produces: `retry_budget(cfg: dict) -> RetryBudget` where `RetryBudget(max_attempts: int, backoff_s: float)`

- [ ] **Step 1: Write failing tests** in `tests/config/test_retry.py`
  `test_defaults_when_absent`: `retry_budget({})` == `RetryBudget(3, 0.5)`
  `test_rejects_zero_attempts`: `retry_budget({"max_attempts": 0})` raises `ValueError("max_attempts must be >= 1")`

- [ ] **Step 2: Run, expect FAIL**
  `pytest tests/config/test_retry.py -v` → Expected: FAIL, `ImportError: cannot import name 'retry_budget'`

- [ ] **Step 3: Implement `retry_budget(cfg: dict) -> RetryBudget` and the `RetryBudget` dataclass in `src/config/retry.py`**
  Defaults 3 and 0.5 (design D4).

- [ ] **Step 4: Run, expect PASS**
  `pytest tests/config/test_retry.py -v` → Expected: 2 passed

- [ ] **Step 5: Commit**
  `git add src/config/retry.py tests/config/test_retry.py && git commit -m "feat(config): parse retry budget"`
````

## Global Constraints

Every plan, whatever its style, carries a `## Global Constraints` section in the overview: the rules that bind every task, one per line, with exact values copied verbatim from their source.

**What qualifies:** language and runtime version floors, platform requirements, dependency limits (no new dependencies, or an allowed set), naming and user-facing copy rules, exact values the design pins globally (limits, timeouts, units), and repo rules from `CLAUDE.md` that bind code. A rule that binds one task belongs in that task's steps, not here.

**Sources:** while reading the design or source (writing-flow step 1), collect candidates from it (every doc, including decisions that state a global rule; for `--from`, every source file and the intake answers), the repo's `CLAUDE.md`, and the repo's manifests where present (`package.json` `engines`, `.nvmrc`, `pyproject.toml` `requires-python`, `.python-version`, `go.mod` `go` directive, `Cargo.toml` `rust-version`, and the like), ground-truthed like any other cited path. Each line ends with a short source parenthetical: `(design D3)`, `(source notes.md)`, `(CLAUDE.md)`, `(package.json engines)`.

**Confirmation:** show the list in writing-flow step 2, in the same exchange as the phase-decomposition confirmation, via `AskUserQuestion` with **Looks right** `(Recommended)` and **Edit the list**. An edit loops once through the list and back.

**Placement:** `## Global Constraints` in the overview, after the header lines and before `## Review Focus`. An empty list is written as `None.` (checked, found nothing; never skipped). Constraints are not repeated inside tasks: `/c-execute` passes the section to every implementer and both reviewers.

## Review Focus

Every plan carries a `## Review Focus` section in the overview: up to five input classes or failure modes the design implies but no task's tests exercise, the ones most likely to bite a person using the software first. The design's silence on an input is not permission for that input to break the program.

**Selection:** after the phase docs are drafted (writing-flow step 5a), walk the design's inputs, states, and boundaries with the design in front of you, list the ones no task's tests exercise, and keep the five most likely to hurt a user. Fewer is fine; an empty section is written as `None found.` (checked, found nothing).

**Line format:** `- <input or condition> → <behavior a reasonable person would expect> (pinned in Task N.M)`.

**Pinning:** add a check for each entry to the task that owns the code, in that task's own step style:

| `plan.tdd` | The pin |
|---|---|
| `true` | A test in the owning task's test step (a new test function, or new assertions in its existing test), with the expected behavior as its assertion, run by the task's RED and GREEN steps. |
| `false` | A run step in the owning task with the exact command that exercises the input and the output that means it behaved. |

`/c-execute` passes the section to the reviewer, which checks that each owning task's diff carries its pin.

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

## Visual `Reads:` attachment (designs with 95, or sources with mockups)

For a `--from` source, every task whose `Touches:` intersects the Surface map's file set gets the mockup files for its surfaces in `Reads:`, by absolute path. For a design, it gets two entries: the design's `95-visual-contract` doc (cited the way design docs are cited on the resolved backend: a `<paths.designs>/<slug>/95-visual-contract.md` path on the filesystem, the design's "95 Visual Contract" sub-page reference on notion), and the frozen mockup version, cited as `mockup:NN` against the design slug (the implementer resolves it via read_mockup). No new task field exists; `Reads:` already carries the read-before-writing contract. Every mockup version is a local file, on every backend, so a machine-local caveat travels with the citation: a lane on another machine reports the missing file as a normal missing-`Reads:` blocker rather than guessing.

## `96-validation.md` — three explicit categories

Walked by `/c-validate` only after the plan is `implemented` and the user has deployed. Three required sections:

- **A. Automated** — Claude runs each: `curl`, `psql`, `pytest`, etc. Expected value/shape; broken-if signal.
- **B. Manual workflow** — User clicks; Claude verifies after each step via DB/API. **Optional `e2e:` reference:** when you can identify a Playwright spec (and optional grep/tag) that exercises a Category B flow — drawn from the design and the repo's existing `tests/e2e/` specs — append an indented `e2e: <spec> -g "<grep>"` sub-line beneath that item's checkbox so `/c-validate` can run it headless (grammar in `skills/_shared/browser-validation.md`). The cited spec path is subject to the **"Codebase verification (mandatory)"** rule above — ground-truth it against the repo before it lands, the same as any `Touches:`/`Reads:` path. When no relevant spec exists, write a plain manual step (no `e2e:` line) — attaching a reference is opportunistic, never mandatory, and never breaks the plain-manual path.
- **C. Prerequisites** — User does before Claude can test (deploy, fixtures, keys). Walk blocks until all C confirmed.

Every entry gets `- [ ]`. `/c-validate` checks them off as it walks.

## `97` / `98` shells

Each is a single `[!note] Reference shell` callout (authored in the backend's form per `skills/_shared/obsidian-format.md`'s backend rule) pointing back to the design's matching doc. Same shape for 97 and 98. If the design omitted 97/98 (opt-in not taken), the shell still creates with a pointer to the design's overview. A `--from` plan has no design to point at and writes no 97/98 shells.

## `99-out-of-scope.md` (plan-side)

Initial content is a shell — a link to the design's Out of scope (or the source, for `--from`) and "(No entries yet.)" Entries land when `/c-plan` Q&A surfaces a cut OR `/c-execute` mark-out-of-scope is invoked.

## Writing flow

1. Resolve config by running `node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-config.js"` (`plan.tdd`, `plan.style`, `authoring.*`; contract in `skills/_shared/config-resolution.md`; never read config files directly). Read the approved design or the `--from` source end to end (for `--from`, run the intake check first), collecting Global Constraints candidates as you read (see "Global Constraints").
2. Confirm phase decomposition (no split question — one plan always): one phase file per topic (see "Phase files are topics"), not one per design doc. Confirm with the user: *"Plan files will be `01-<topic>`, `02-<topic>`, …. Sound right?"* In the same exchange, confirm the Global Constraints list (see "Global Constraints").
3. Resolve `authoring.plan_mode`; when it names a concrete mode (`all-at-once`, `inline`) use it without asking. When it is `ask`, ask via `AskUserQuestion` (default `(Recommended)` = all-at-once): **All-at-once** — one generator agent per remaining doc in parallel plus the `cadence-doc-consistency` sweep (today's behavior); **Inline** (label: "Inline, no sub-agents") — the main session writes every doc itself, sequentially, running the codebase verification pass on each doc before moving on; no generators, no sweep. When `plan.style` is `ask`, ask the style question in the same exchange (see "Plan style").
4. Create the plan artifact first via `skills/_shared/storage-resolution.md` (create_artifact), writing the `00-overview` (frontmatter + Plan style line + Global Constraints + phase index + File Map — generators need them; Review Focus is written in step 5a) with `base_sha` initialized empty; do not path-compute `<paths.plans>/…/00-overview.md`.
5. (all-at-once mode) Dispatch one fresh generator agent per remaining doc (phase docs, `96-validation`, `97`/`98` shells, `99-out-of-scope`) **in parallel**, up to `authoring.max_parallel`; each generated doc is written to its slot per `skills/_shared/storage-resolution.md` (write_doc), never to a hand-computed `<paths.plans>/…` file. Before each generator finalizes its doc, run the codebase verification pass (above) on every path, symbol, and import it cites. Fix inline. (inline mode) The main session writes each remaining doc itself, in order, applying the same codebase verification pass per doc.
5a. **Review Focus.** Once the phase docs are drafted, select the Review Focus entries, add each entry's pin to its owning task, and write the `## Review Focus` section into the overview via write_doc (see "Review Focus").
6. **Invariant 2 in reverse.** If a phase reveals a gap or inconsistency in the design or source, surface it. Default: update the plan only; with the user's opt-in, update plan and design. A `--from` source is never edited.
7. (all-at-once mode; inline skips the sweep — single author) Dispatch `cadence-doc-consistency` once over the full set. Reconcile trivial wording; surface substantive contradictions to the user via `AskUserQuestion`. Re-dispatch only affected generators on resolution. The plan is not finalized until the sweep is clean.
8. **Linkage.** From a design, call `skills/_shared/storage-resolution.md` (link) once (see "Linkage"). From a source, the overview's Source line is the link; nothing to write.
9. **Resolve cross-references.** After all plan docs exist and the sweep is clean, call `skills/_shared/storage-resolution.md` (resolve_links) once over the plan to turn `[[…]]` wikilinks into Notion page mentions (sibling plan docs and cross-links to the design's now-existing pages). Backend-neutral: a no-op on the filesystem backend, the mention second pass on notion (see `skills/_shared/notion-translation.md`).
10. **Self-review pass** (see below).
11. Status stays `draft`. Print: *"Plan written. Run `/c-execute <path>` when ready."*

## Generation modes

Plan docs are mechanical, so `/c-plan` offers `all-at-once` (default) and `inline`, never a paused one-by-one mode. In all-at-once mode each generator gets the design or source (or the relevant slice), the plan overview (whose Plan style line says which step rules apply), its doc's scope, the storage backend, and the format conventions (`skills/_shared/obsidian-format.md`, **plus `skills/_shared/notion-translation.md` on notion**, so callouts are native `<callout>` blocks). The plan is not finalized until the consistency sweep is clean; inline mode skips the sweep (single author).

## Self-review pass

1. **Placeholder scan** — no banned phrases (`TBD`, `TODO`, `implement here`, `similar to Task N`, `add validation`). In decision plans it also flags a code step with no signature ("Implement the parser" decides nothing).
2. **Task shape** — every task has `Reads:`, `Touches:`, and `Depends:` fields, ≥3 steps, and a final commit step; every `Touches:` entry is a real path; every `Depends:` id references a real task.
3. **Code completeness (full-code plans)** — every code step has actual code, not a stub. **Step sufficiency (decision plans)** — every step lets the implementer write exactly one reasonable thing, and no step carries more: a line that decides nothing is a gap, and a function body the signature and tests already determine is a transcript.
4. **Command completeness** — every run-command step has exact command + expected output.
5. **Symbol/path/import verification** — every cited file path, line range, symbol, and import was ground-truthed against the current code per "Codebase verification" rules. Intra-plan consistency also holds: names referenced across later tasks match earlier ones. (`/c-audit`'s `code-behind-checkbox` audit remains a backstop at completion.)
6. **File Map honesty** — every file in tasks appears in File Map; nothing in File Map is missing from tasks.
7. **Wikilink integrity** — every `[[…]]` resolves.
8. **Callout-form check (notion backend only)** — scan the read-back for escaped callout remnants (`\[!` or a quote block starting `> [!`): either means a callout reached Notion in obsidian syntax and rendered as literal text. Rewrite that callout as a native `<callout>` block per `skills/_shared/notion-translation.md`.
9. **Visual-citation check (95 designs, or sources with mockups)** — every task whose `Touches:` intersects the Surface map carries its visual citations in `Reads:` (both, for a 95 design); no task outside the intersection carries a mockup citation (the contract doc may be cited freely where useful).
10. **Proportion (decision plans)** — the share of each phase doc's lines inside code blocks is at most `plan.max_code_share` (default 0.3). A doc over it fails: replace each function body the signature and tests already determine (item 3) with the signature, test names, and assertions until it is under. Only when what remains is test assertions and exact copy the design or source fixes may a doc stay over; then report it flagged, with its share. Also report the plan's word count against the design's or source's, as information.
11. **Interface closure (decision plans)** — every task has an Interfaces block; every `Consumes:` entry is produced by a task in the consumer's `Depends:` closure or verified to exist in the codebase; every `Produces:` name a later task uses matches exactly.
12. **Global Constraints sourced (every plan)** — the section exists; every line has a source parenthetical that resolves (a design decision or doc, a source file, `CLAUDE.md`, or a manifest the plan cites).
13. **Review Focus closure (every plan)** — the section exists with at most five entries; every entry names a real task id; that task carries the pin (a test assertion when `plan.tdd` is true, a run step with expected output when false).

Fix every item inline; item 10 may end flagged only as it describes. No re-review needed.

Report the pass in the closing summary as one line per item that applies to this plan's style and backend, by number and name, each with its result: clean, fixed (and what changed), or flagged. An item missing from that list counts as not run, so the user can see that the style-specific checks (3, 10, 11) and the companion checks (12, 13) actually ran.

## What `/c-plan` doesn't do

- Doesn't write code.
- Doesn't modify the design (already approved) except through step 6's opt-in, and never modifies a `--from` source.
- Doesn't run anything.
- Doesn't auto-execute. `/c-execute` is separately invoked.

## References

- Shared frontmatter: `skills/_shared/frontmatter.md`.
- Shared format: `skills/_shared/obsidian-format.md`.
