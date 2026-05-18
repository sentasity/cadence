# Frontmatter spec (shared by /c-design, /c-plan, /c-validate)

Authoritative reference for the YAML frontmatter Cadence skills read and write on designs and plans. Sourced from [[designs/2026-05-17-cadence/02-design#Frontmatter spec]] and [[designs/2026-05-17-cadence/03-plan#00-overview.md content]].

## Design overview (`<paths.designs>/<slug>/00-overview.md`)

```yaml
---
title: <Human-readable title>
created: <ISO date YYYY-MM-DD>
updated: <ISO date YYYY-MM-DD>
status: draft | in-review | approved | completed | superseded | on-hold
tags: [design, ...user-supplied]
linked_plans: []          # populated by /c-plan; one slug per linked plan
---
```

## Design child doc (any non-overview file in the folder)

```yaml
---
title: <Human title>
---
```

Lifecycle (status, dates) lives on `00-overview.md` only. The overview's `updated:` field moves whenever any file in the set changes.

## Plan overview (`<paths.plans>/<slug>/00-overview.md`)

```yaml
---
title: "Plan — <Human title>"
created: <ISO date>
updated: <ISO date>
status: draft | in-progress | implemented | completed | superseded | on-hold
tags: [plan, ...]
linked_design: <YYYY-MM-DD-SLUG>   # the design's folder name
base_sha: null                       # set by /c-execute on first invocation; never re-anchored
---
```

## Plan phase doc

```yaml
---
title: "Plan — <Human title> Phase NN: <PHASE_NAME>"
---
```

## Status transition rules (enforced by skills)

| Artifact | From | To | Who triggers |
|---|---|---|---|
| Design | draft | in-review | /c-design after self-review |
| Design | in-review | approved | User says "approved" |
| Design | approved | completed | /c-validate offers when all linked plans hit completed |
| Plan | draft | in-progress | /c-execute starts |
| Plan | in-progress | implemented | /c-execute after /c-audit passes |
| Plan | implemented | completed | /c-validate after 96-validation walks clean |

All transitions update `updated:` to today's ISO date.
