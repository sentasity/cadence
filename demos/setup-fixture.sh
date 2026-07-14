#!/usr/bin/env bash
# Builds the scratch fixture repo the demo tapes record inside.
# Idempotent: wipes and rebuilds demos/.build/acme-api from scratch each run so
# every recording starts from the same state. Never touches the real repo.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIXTURE="$REPO_ROOT/demos/.build/acme-api"

rm -rf "$FIXTURE"
mkdir -p "$FIXTURE"
cd "$FIXTURE"

git init -q
git checkout -q -b main

# A small plausible codebase so /c-brainstorm's context scan (git log, repo
# files) has something real to read.
cat > README.md <<'EOF'
# acme-api

Public REST API for Acme. FastAPI service exposing order and customer
endpoints to third-party integrators, authenticated via per-integrator API keys.
EOF

mkdir -p app
cat > app/main.py <<'EOF'
"""Acme public API: order and customer endpoints for third-party integrators."""

from fastapi import Depends, FastAPI

from app.auth import require_api_key

app = FastAPI(title="acme-api")


@app.get("/v1/orders")
def list_orders(integrator: str = Depends(require_api_key)) -> list[dict]:
    """List the integrator's orders, newest first."""
    raise NotImplementedError


@app.get("/v1/customers/{customer_id}")
def get_customer(customer_id: str, integrator: str = Depends(require_api_key)) -> dict:
    """Fetch a single customer record."""
    raise NotImplementedError
EOF

cat > app/auth.py <<'EOF'
"""Per-integrator API-key authentication."""

from fastapi import Header, HTTPException


def require_api_key(x_api_key: str = Header()) -> str:
    """Resolve the API key to an integrator id, or raise 401."""
    raise HTTPException(status_code=401, detail="invalid API key")
EOF

git add README.md
git commit -qm "chore: repo scaffold"
git add app/auth.py
git commit -qm "feat: per-integrator API-key auth"
git add app/main.py
git commit -qm "feat: order and customer endpoints"

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
  subsystem to brainstorm (enforcement middleware / limit storage /
  client-facing headers and docs), then which rate-limiting algorithm to use
  (fixed window / sliding window / token bucket).
- Keep question text and option labels short (options under 60 characters).
- Propose exactly two approaches via AskUserQuestion, then ask the final
  "write the stub?" confirmation as its own separate AskUserQuestion.
- Never mention this file or these demo rules in your visible output. Run the
  session exactly as you would in a real repo.
EOF

git add .cadence CLAUDE.md
git commit -qm "chore: cadence config + demo notes"

echo "fixture ready: $FIXTURE"
