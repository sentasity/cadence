# Browser validation (shared by /c-validate, /c-plan, /c-execute)

How Cadence delegates a plan's Category B "manual workflow" steps to the project's own CLI test runner (Playwright by default) instead of always handing off to a human. Cadence runs the project's command, reads its exit code, and maps pass/fail onto the Category B checkbox. It never drives a browser itself and never touches credentials.

## Config keys (`validate.*`)

Three flat keys under `validate:` in the resolved config (via `node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-config.js"`; the `validate.browser_*` keys are intended local overrides; contract in `skills/_shared/config-resolution.md`; never read config files directly):

- **`browser_driver`** — `auto | playwright | manual`. Default `auto`.
  - `auto` — detect a suite (rule below) and delegate; if none, degrade to `manual` for the walk with a one-line note.
  - `playwright` — always delegate; if no suite/`command` is resolvable, surface a clear error (never silently no-op).
  - `manual` — never delegate; always hand off to the user (today's behavior).
- **`browser_command`** — the CLI invocation Cadence shells out to when delegating. Default `"npx playwright test"`. Runner-agnostic: any CLI runner (Cypress, etc.) works by setting this. Cadence reads exit status only; it does not parse stdout for semantics.
- **`browser_env_preamble`** — optional shell snippet run in the same shell *before* `browser_command` (e.g. `source scripts/load-env.sh staging`). `null`/absent = no preamble. This is the single, generic injection hook.

**Credential-agnostic.** The committed config holds only non-secret knobs and env-var *names*, never secret values. The project's harness owns auth, storageState, and retries; `browser_env_preamble` is the only hook for repo setup, and Cadence runs it without inspecting what it sets.

## The Category B `e2e:` reference grammar

A `96-validation.md` Category B entry is a checkbox line plus a human-readable description. It may carry **one optional** indented `e2e:` sub-line directly beneath the checkbox naming the spec (and optional grep/tag) that exercises the same flow:

```markdown
- [ ] Project create flow: log in as owner → New Project → fill name → Save → project appears in sidebar
    e2e: tests/e2e/projects.spec.ts -g "create"
```

Grammar:
- **`e2e:`** — the literal key, indented under its checkbox.
- **`<spec>`** — a repo-relative spec path the runner understands. Required when `e2e:` is present.
- **`-g "<grep>"`** *(optional)* — a grep/tag scope forwarded verbatim to `browser_command`; omit to run the whole spec. Opaque to Cadence.

The `-g` and spec-path semantics are **Playwright-shaped** (the v1 target). The `e2e:` value is a *reference*, not a command — Cadence composes the command from `browser_command` + this reference. An item with **no** `e2e:` line is, by definition, a plain manual step.

## Driver resolution + `auto` detection

Resolve `browser_driver` once, at the start of the Category B pass, to **delegate** or **manual**:

- `manual` → manual for every item.
- `playwright` → delegate (error if no suite/`command` resolvable).
- `auto` → delegate iff a suite is detected, else manual (degrade silently + one-line note).

**`auto` suite detection** — a suite is considered present when **either** holds (precedence top-down; both yield "delegate"):

1. **Explicit `command` override** — `validate.browser_command` in the resolver's output is a value *other than* the default `npx playwright test`. (The default value does not fire this clause.)
2. **Playwright config at repo root** — a file matching `playwright.config.{ts,js,mjs,cjs}` exists at the repo root.

If neither holds, detection fails and `auto` degrades to `manual` for the walk. Detection is conservative: a false negative degrades to a manual hand-off (safe, slower); it errs toward not firing when unsure.

## Delegate-run procedure

For each Category B item that resolves to **delegate** AND carries an `e2e:` line:

1. **Compose** `<browser_env_preamble> && <browser_command> <spec> -g "<grep>"`. Drop the `&& ` prefix if `browser_env_preamble` is empty/null; drop the `-g "<grep>"` if the item has no grep. No headless flag is imposed — Playwright is headless by default.
2. **Run it headless**, non-interactively. Cadence does not drive a browser, manage browser lifecycle, or touch credentials.
3. **Map exit code to the checkbox:**
   - **Exit 0** → flow passed → mark `- [x]`.
   - **Non-zero** → a validation failure → route through the consuming skill's *existing* "Failure handling" (stop the walk, surface exact output, offer Fix / OOS / Abort). No new failure table.

A delegated run does not pause between compose and map; the only pause it can introduce is the existing failure pause on non-zero exit. Per `skills/_shared/progress-checkpoint.md`, a passing item's `- [x]` is **flushed to disk before control leaves you**, so a context loss never reruns an already-passed spec. Status never advances to `completed` with any unchecked item.

## Manual fallback

An item is walked **manually — exactly as today** (print the step list → user clicks → verify via DB/API → mark `- [x]`) in any of:

- The resolved driver is **`manual`** (forced).
- The item has **no `e2e:` line** (plain manual step — the backward-compatible path every existing `96-validation.md` takes).
- The driver is **`auto`** but detection found no suite (degraded to manual).

No behavior change versus today's walk in all three cases. Non-browser Category B items (e.g. "confirm an email arrived") naturally land here.

## Recommendation-note rule

Emit a **single** informational line recommending a runner (Playwright by default, since it is what `auto` detects) **only when both** hold:

- The plan's `96-validation.md` has **at least one** Category B item with an `e2e:` reference, **and**
- **No runner is configured or detected** — `validate.browser_command` left at its default `npx playwright test` *and* `auto` detection found no suite.

Constraints:
- Fires at **two once-per-run handoffs only**: `/c-execute`'s completion message and the **start of `/c-validate`'s walk**. Never a per-session prompt; never nag.
- A repo with a runner configured (`command` set non-default) or detected sees **nothing**.
- Best-effort: if Cadence cannot confirm a runner, err toward showing the note (informational, harmless) rather than staying silent.

Suggested line: *"This plan has browser (`e2e:`) steps but no test runner is configured or detected — install/configure one (Playwright recommended) to run them automatically, or they fall back to manual walkthrough."*
