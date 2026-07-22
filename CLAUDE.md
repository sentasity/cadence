# Cadence repo conventions

## Config reads go through the resolver

Skill and agent text in this repo must route every Cadence config read through `scripts/resolve-config.js` (invoked as `node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-config.js"`). Never write skill or agent text that instructs a direct read of `.cadence/config.yaml`, `.cadence/config.local.yaml`, or `defaults/config.default.yaml` — prose resolution is exactly the failure the resolver exists to remove. The contract (output shape, exit codes, hard-stop rule, sanctioned write paths) lives in `skills/_shared/config-resolution.md`.

## Tests

`node --test 'scripts/*.test.js'` runs the script suites (`migrate-config.test.js`, `resolve-config.test.js`). Run it before any PR that touches `scripts/`.
