<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="website/public/brand/cadence-lockup-dark@2x.png">
    <img alt="Cadence" src="website/public/brand/cadence-lockup-light@2x.png" width="360">
  </picture>
</p>

**Claude jumps straight to code, skips design, leaves half-done plans, and forgets to validate. Cadence enforces the stages.**

> **Docs:** [sentasity.github.io/cadence](https://sentasity.github.io/cadence/) — a guided course and per-command reference.

Cadence is a Claude Code plugin that turns "I want to build X" into a working, validated implementation through nine slash commands: six core-flow (`/c-brainstorm` → `/c-design` → `/c-plan` → `/c-execute` → `/c-audit` → `/c-validate`) plus three diagnostic (`/c-check`, `/c-find-bugs`, `/c-explain`). A tenth command, `/c-worktree`, ships alongside them as a standalone utility for the interactive git-worktree lifecycle, not a pipeline stage. Each stage produces a tangible artifact. Each gate is explicit. No atomic chains. No silent drift. No deferred TODOs in code.

Built for users who are strong on operations and ideation but can't verify code by reading diffs — Cadence's audit and validation layers carry that load.

## Install

```
/plugin marketplace add sentasity/cadence
/plugin install cadence@cadence
```

After session restart, all ten `/c-*` commands work in every repo on your machine (the tenth, `/c-worktree`, is a standalone worktree utility, not a pipeline stage). First time you run `/c-brainstorm` in a fresh repo, Cadence detects there's no config and offers to scaffold one with three questions — no separate setup step.

## Demo

```
$ /c-brainstorm I want to add a credit ledger that shows AWS credits per account

→ Reading project context (recent commits, related designs, .cadence/config.yaml)...

→ Question 1: This idea spans multiple subsystems (data ingest, reconciliation, UI).
  Which one should we brainstorm first?
    (a) Data ingest (CUR + credit API)        ← Recommended: start with the data
                                                  foundation so the rest can read it
    (b) Reconciliation logic
    (c) UI surfaces

$ a

→ Question 2: How should reconciliation handle credit-sharing across sub-accounts?
    (a) Owner-account stores; consumer-accounts reference via foreign key
    (b) Denormalize: both sides hold a copy        ← Recommended for query simplicity
    (c) Don't model sharing in v1

$ b

→ ...

→ Two approaches proposed (see decisions log). Recommended: pull-model daily
  reconciliation. Pick: (1) pull-model / (2) push-model / (other)?

$ 1

→ Writing 00-overview.md to docs/obsidian/designs/2026-05-17-credit-ledger/
→ Stub written. Run /c-design to write the child docs.
```

You then run `/c-design` (writes child docs one at a time, with "look good?" pauses), `/c-plan` (translates the approved design into an execution-ordered plan), `/c-execute` (PM-and-sub-agents drives the plan to completion with two-stage review per task), and `/c-validate` (walks the post-deploy validation doc).

## The ten skills

**Core flow** — the lifecycle of one piece of work:

| Skill | What it does |
|---|---|
| `/c-brainstorm <idea>` | Q&A loop. Writes a `00-overview.md` stub. |
| `/c-design` | Writes the full design folder, child by child, written for humans. |
| `/c-plan` | Translates approved design into an execution-ordered plan, written for AI. |
| `/c-execute <plan-path>` | PM-and-sub-agent execution. Calls `/c-audit` at completion. |
| `/c-audit <plan-path>` | Strict check that the plan was actually implemented. Auto-invoked by `/c-execute`; also callable standalone for spot-checks. |
| `/c-validate <plan-path>` | Post-deploy walk of `96-validation.md`. Flips status to `completed`. |

**Diagnostics** — ad hoc, run any time:

| Skill | What it does |
|---|---|
| `/c-check <path>` | Substance review of a design or plan: accuracy, completeness, gaps. Asks: "is this good?" |
| `/c-find-bugs <target>` | Concrete defect hunting. Targets: design, plan, branch, file, or `--repo`. |
| `/c-explain <path>` | Interactive discussion of an existing design or plan. Orientation + open Q&A, grounded in doc and code. Asks: "what does it say & how does it work?" |

**Utility** (outside the pipeline, works in any git repo):

| Skill | What it does |
|---|---|
| `/c-worktree` | Interactive git-worktree lifecycle: create (base chosen by an explicit question), optional dev server via config hooks, lock-guarded merge back, cleanup. Shares its merge lock and `worktree:` config with `/c-execute`. |

## When to use which diagnostic

The three diagnostics produce different shapes of output:

| Skill | Answers | Typical moment |
|---|---|---|
| `/c-check` | Is this design or plan good — accurate, consistent, complete? | Before flipping a design to `approved`; before running `/c-plan`. |
| `/c-find-bugs` | What specific defects exist in this thing? | When you want a concrete fix list. Also runs on code (branch, file, repo). |
| `/c-explain` | What does this say and how does it actually work? | When you want to understand a design you didn't write, or refresh on one you haven't touched in a while. |

## Worked example

See [`examples/hello-cadence/`](examples/hello-cadence/) for a complete design + plan + validation walkthrough of a toy project. End-to-end read in under 10 minutes; shows what "done" looks like.

## What makes Cadence different from `superpowers`

[`superpowers`](https://github.com/obra/superpowers) atomically chains brainstorm → write-plan → execute and produces one AI-generated artifact (the spec) that serves as both brainstorm output and plan input. For users who can't read code, that artifact often looks "complete" enough to approve without real review — bugs only surface during execution.

Cadence's `/c-brainstorm` → `/c-design` split is deliberate: the design is a separate human-readable artifact, written child-doc-by-child-doc with explicit "look good?" pauses, plain-English callouts at every H2 section, and a mandatory plain-English narrative (`00a-plain-english.md`). It's meant to be reviewable by someone who isn't going to read implementation diffs. The plan is then written for AI consumption from the approved design — exact paths, exact commands, no narrative.

The two tools coexist. Install both, pick per task. Cadence doesn't deprecate or replace anything in your existing setup.

## How it scales

Cadence is built for large repos (200k+ LOC, multi-language). The PM stays in your session; fresh sub-agents per task read only the task block + linked files (never the whole repo). Built-in safeguards:

- **Judgment-based plan splitting** — `/c-plan` asks one question; large plans are treated as an upstream scoping failure, not a tunable knob.
- **`execute.max_parallel`** caps simultaneous sub-agent dispatch (default 5).
- **Resume protocol**: a long plan can execute across multiple sessions; status `in-progress` is resumable.
- **`NEEDS_CONTEXT` escalation**: when an implementer hits a gap, it asks the PM for specific files; PM fetches and re-dispatches. Prevents the "hallucinate to fill the void" failure mode.

## License

MIT.

## Maintainer

[github.com/sentasity](https://github.com/sentasity). Contributions welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md) for the process (open an issue first, run `/c-check` on any design changes before submitting a PR).
