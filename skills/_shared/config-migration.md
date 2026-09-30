# Config migration (retired)

Config migration is now handled automatically by the Cadence `SessionStart` hook — no skill runs this routine in its pre-flight anymore.

The hook (`hooks/hooks.json`) runs `scripts/migrate-config.js` at session start.
