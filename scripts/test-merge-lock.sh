#!/usr/bin/env bash
# Smoke test for merge-lock.sh. Builds a temp git repo + two worktrees and asserts
# the lock's core invariants. Exits non-zero on first failure.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
LOCK="$HERE/merge-lock.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail() { echo "FAIL: $1" >&2; exit 1; }
pass() { echo "ok: $1"; }

# --- build a repo with two worktrees (wtA on branch a, wtB on branch b) ---
git init -q "$TMP/main"; cd "$TMP/main"
git config user.email t@e.st; git config user.name t
git commit -q --allow-empty -m init
git worktree add -q "$TMP/a" -b a >/dev/null
git worktree add -q "$TMP/b" -b b >/dev/null

# 1. A acquires; B cannot (mutual exclusion via short wait budget -> WAITING).
( cd "$TMP/a" && "$LOCK" acquire ) | grep -q ACQUIRED || fail "A should ACQUIRE"
pass "A acquired"
out="$( cd "$TMP/b" && WT_LOCK_POLL_INTERVAL=1 "$LOCK" acquire --wait-budget 2 || true )"
echo "$out" | grep -q WAITING || fail "B should WAIT while A holds (got: $out)"
pass "B waits while A holds"

# 2. B must NOT be able to release A's lock.
( cd "$TMP/b" && "$LOCK" release ) && fail "B must not release A's lock" || pass "B refused to release A's lock"

# 3. A releases; B can then acquire.
( cd "$TMP/a" && "$LOCK" release ) | grep -q released || fail "A should release"
( cd "$TMP/b" && "$LOCK" acquire ) | grep -q ACQUIRED || fail "B should ACQUIRE after release"
pass "B acquired after A released"
( cd "$TMP/b" && "$LOCK" release ) >/dev/null

# 4. Stale detection: hand-create a lock dir with an old timestamp, no live pid.
COMMON="$(cd "$TMP/main" && git rev-parse --path-format=absolute --git-common-dir)"
mkdir -p "$COMMON/worktree-merge.lock"
python3 -c 'import json,sys; json.dump(dict(branch="ghost",worktree="x",pid=999999,acquired_at="2000-01-01T00:00:00Z",target="a"), open(sys.argv[1],"w"))' "$COMMON/worktree-merge.lock/holder.json"
out="$( cd "$TMP/a" && "$LOCK" acquire --wait-budget 2 || true )"
echo "$out" | grep -q STALE || fail "old lock should read STALE (got: $out)"
pass "stale lock detected"

# 5. steal clears the stale lock and acquires.
( cd "$TMP/a" && "$LOCK" steal ) | grep -q ACQUIRED || fail "steal should ACQUIRE"
( cd "$TMP/a" && "$LOCK" release ) >/dev/null
pass "steal works"

# 6. Feature-session topology: acquire in the feature worktree, then release after
#    cd'ing to the main worktree (our branch becomes the integration branch). Release
#    must succeed by matching the holder's recorded target, not the acquire-time branch.
MAINBR="$(cd "$TMP/main" && git rev-parse --abbrev-ref HEAD)"
( cd "$TMP/a" && "$LOCK" acquire --target "$MAINBR" ) | grep -q ACQUIRED || fail "a should ACQUIRE (feature-session)"
( cd "$TMP/main" && "$LOCK" release ) | grep -q released || fail "release from main worktree should succeed via target match"
pass "feature-session release (acquire in worktree, release from main) works"

# 7. An unrelated branch still cannot release a held lock.
( cd "$TMP/a" && "$LOCK" acquire --target "$MAINBR" ) >/dev/null
( cd "$TMP/b" && "$LOCK" release ) && fail "branch 'b' must not release a-held/main-targeted lock" || pass "unrelated branch still refused"
( cd "$TMP/main" && "$LOCK" release ) >/dev/null

echo "ALL MERGE-LOCK TESTS PASSED"
