# Cadence

**Claude jumps straight to code, skips design, leaves half-done plans, and forgets to validate. Cadence enforces the phases.**

> [!warning] Work in progress — v0.1 bootstrap
> This README is a skeleton landed in the plugin's foundation pass. The full
> content (per [the design](https://github.com/sentasity/cadence/blob/main/docs/README-spec.md))
> lands when the skills, agents, and worked example are complete — see the
> polish plan in the source repo for the finalize step.

Cadence is a Claude Code plugin that turns "I want to build X" into a working, validated implementation through eight slash commands: six core-flow (`/c-brainstorm` → `/c-design` → `/c-plan` → `/c-execute` → `/c-audit` → `/c-validate`) plus two diagnostic (`/c-check`, `/c-find-bugs`). Each phase produces a tangible artifact. Each gate is explicit. No atomic chains. No silent drift. No deferred TODOs in code.

## Install (when v0.1 ships)

```
/plugin marketplace add sentasity/cadence
/plugin install cadence@cadence
```

After session restart, all eight `/c-*` commands work in every repo on your machine.

## Status

See the [milestone tracker](https://github.com/sentasity/cadence/milestones) for v0.1 progress.

## License

MIT.
