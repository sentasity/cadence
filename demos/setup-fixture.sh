#!/usr/bin/env bash
# Builds the scratch fixture repo the demo tapes record inside.
# Idempotent: wipes and rebuilds demos/.build/credit-ledger from scratch each
# run so every recording starts from the same state. Never touches the real repo.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIXTURE="$REPO_ROOT/demos/.build/credit-ledger"

rm -rf "$FIXTURE"
mkdir -p "$FIXTURE"
cd "$FIXTURE"

git init -q
git checkout -q -b main

# A small plausible codebase so /c-brainstorm's context scan (git log, repo
# files) has something real to read.
cat > README.md <<'EOF'
# cloudspend

Internal tool that pulls AWS Cost and Usage Report (CUR) snapshots into a local
DuckDB database and produces per-account cost rollups for the finance channel.
EOF

mkdir -p src
cat > src/ingest.py <<'EOF'
"""Pull daily CUR snapshots from S3 into the local DuckDB store."""


def ingest_daily_snapshot(bucket: str, date: str) -> int:
    """Download the CUR parquet files for `date` and load them. Returns row count."""
    raise NotImplementedError
EOF

cat > src/rollups.py <<'EOF'
"""Per-account cost rollups over the ingested CUR data."""


def account_rollup(month: str) -> dict[str, float]:
    """Return total unblended cost per linked account for the given month."""
    raise NotImplementedError
EOF

git add README.md
git commit -qm "chore: repo scaffold"
git add src/ingest.py
git commit -qm "feat: pull daily CUR snapshots into local DuckDB"
git add src/rollups.py
git commit -qm "feat: per-account cost rollups"

# Real Cadence config so the skill's missing-config scaffold offer never
# triggers (it would add a branch the tape cannot follow).
mkdir -p .cadence
cp "$REPO_ROOT/defaults/config.default.yaml" .cadence/config.yaml

# Pre-allow the tools the skill's context scan uses (git log via Bash, file
# reads, the stub write). Without this, permission prompts appear mid-recording
# and the tape's fixed keystroke sequence cannot handle them.
mkdir -p .claude
cat > .claude/settings.local.json <<'EOF'
{
  "permissions": {
    "allow": [
      "Bash",
      "Read",
      "Glob",
      "Grep",
      "Edit",
      "Write",
      "WebFetch",
      "Task",
      "Skill",
      "TodoWrite"
    ]
  }
}
EOF

# Shapes the recorded session so the tape's fixed keystroke sequence lines up.
# This file is invisible in the GIF; the session itself is still a real one.
cat > CLAUDE.md <<'EOF'
# Demo fixture

This repo is a recording fixture for Cadence demo GIFs. When running
/c-brainstorm here, keep the session tight so it fits a short recording:

- Ask exactly two Q&A questions before the approach proposal: first which
  subsystem to brainstorm (data ingest / reconciliation / UI), then how to
  model credit-sharing across sub-accounts.
- Keep question text and option labels short (options under 60 characters).
- Propose exactly two approaches via AskUserQuestion, then ask the final
  "write the stub?" confirmation as its own separate AskUserQuestion.
- Never mention this file or these demo rules in your visible output. Run the
  session exactly as you would in a real repo.
EOF

git add .cadence CLAUDE.md
git commit -qm "chore: cadence config + demo notes"

echo "fixture ready: $FIXTURE"
