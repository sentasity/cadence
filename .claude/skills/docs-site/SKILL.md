---
name: docs-site
description: Repo-local docs-maintenance dev skill for the Cadence documentation site (the Starlight project in website/). NOT a distributed plugin skill — it never ships to Cadence users. A thin dispatcher that routes to one of three self-contained actions: drift-check (semantically compare each reference page against its source SKILL.md and propose per-page patches, never auto-fixing), new-skill-doc (scaffold a reference page and register it in the sidebar when a new /c-* command ships), and course-lesson (enforce the course voice and structure when writing or revising a course lesson). Use when maintaining, drift-checking, or extending the Cadence docs site.
---

# `docs-site`

You maintain the Cadence documentation site — the Starlight project under `website/`. This is a **repo-local Claude Code skill** at `.claude/skills/docs-site/`. It is a Cadence-development tool only.

This skill is **not** one of the distributed `/c-*` plugin skills. Those live at `skills/<name>/SKILL.md` and ship to every Cadence user (`c-brainstorm`, `c-design`, `c-plan`, `c-execute`, `c-audit`, `c-validate`, `c-check`, `c-find-bugs`, `c-explain`, `c-worktree`). `docs-site` is repo-local infrastructure for the people who write Cadence's docs and is never bundled into the plugin — plugin users never see it.

You are a thin dispatcher. You carry no procedure detail of your own. Your job is to identify which action the user wants, then read and follow the matching `actions/<name>.md` end to end. Each action file is fully self-contained.

## Routing table

Match the user's request against this table and pick exactly one action:

| User intent | Action | File |
|-------------|--------|------|
| "drift check", "is the reference out of date?", "does this page still match its command?", "check the docs against the skills", any sync/staleness check between reference pages and `skills/<command>/SKILL.md` | `drift-check` | `actions/drift-check.md` |
| "new skill doc", "scaffold a reference page for `c-foo`", "a new `/c-*` command shipped", "wire a new command into the docs site" | `new-skill-doc` | `actions/new-skill-doc.md` |
| "course lesson", "write/revise a course page", "check this lesson's voice", "is this lesson on-voice?", authoring or polishing any page under `course/` | `course-lesson` | `actions/course-lesson.md` |

## How to dispatch

1. The user names an action — for example "docs-site drift check", "docs-site new-skill-doc for `c-foo`", or invokes the skill with an action argument.
2. Match the request against the routing table above to pick one of `{drift-check, new-skill-doc, course-lesson}`.
3. Read the matching `actions/<name>.md` and follow that file's procedure end to end. Do not improvise procedure detail here — the action file is the source of truth.
4. **If no action is named (or the request is ambiguous), do not guess.** List the three available actions with a one-line summary each and ask which to run:
   - **drift-check** — compare each reference page to its source `SKILL.md` and propose per-page patches; never auto-fixes.
   - **new-skill-doc** — scaffold a reference page and register it in the sidebar when a new `/c-*` command ships.
   - **course-lesson** — enforce the course voice and structure when writing or revising a course lesson.
