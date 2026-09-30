# Cadence repo conventions

## Config reads go through the resolver

Skill and agent text in this repo must route every Cadence config read through `scripts/resolve-config.js` (invoked as `node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-config.js"`). Never write skill or agent text that instructs a direct read of `.cadence/config.yaml`, `.cadence/config.local.yaml`, or `defaults/config.default.yaml` — prose resolution is exactly the failure the resolver exists to remove. The contract (output shape, exit codes, hard-stop rule, sanctioned write paths) lives in `skills/_shared/config-resolution.md`.

## Tests

`node --test 'scripts/*.test.js'` runs the Node script suites (`migrate-config.test.js`, `resolve-config.test.js`, `notion-write.test.js`, and `skill-structure.test.js`, which checks the shipped skill and agent text), and `bash scripts/test-merge-lock.sh` smoke-tests `merge-lock.sh`. Run both before any PR that touches `scripts/`, `skills/`, `agents/`, or `templates/`.

## Skill descriptions

A skill's `description:` frontmatter says only when to use the skill: it starts with "Use when", stays under 250 characters, and never summarizes the workflow. An agent that reads a workflow summary in the description can follow it instead of the skill body. Guarantees ("never writes code") belong in the body. `scripts/skill-structure.test.js` enforces the shape.
