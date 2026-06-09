#!/usr/bin/env bash
# merge-lock.sh — generic, atomic, per-repo merge lock for serializing worktree
# merges into a shared integration branch.
#
# WHY mkdir: `mkdir` is an atomic create-or-fail syscall, so two waiters can never
# both "win" — no TOCTOU race, and no flock process to keep alive across the
# agent's multi-step merge.
#
# Subcommands:
#   acquire [--threshold S] [--wait-budget S] [--target BRANCH]
#       0 ACQUIRED  lock is ours (holder.json written)
#       2 STALE     held past threshold OR holder pid dead — caller asks the user
#       3 WAITING   still held & fresh, but this call's wait budget elapsed — re-invoke
#   release   remove the lock, only if we own it (holder branch == our branch)
#   status    print holder + age, or "free"
#   steal     force-remove then acquire (only after the user OKs a stale steal)
set -euo pipefail

POLL_INTERVAL="${WT_LOCK_POLL_INTERVAL:-15}"
DEFAULT_THRESHOLD="${WT_LOCK_STALE_THRESHOLD:-600}"   # 10 min
DEFAULT_WAIT_BUDGET="${WT_LOCK_WAIT_BUDGET:-540}"     # 9 min, under the 600s tool cap

common_dir="$(git rev-parse --git-common-dir 2>/dev/null)" || { echo "merge-lock: not in a git repo" >&2; exit 64; }
common_dir="$(cd "$common_dir" && pwd)"
LOCK_DIR="$common_dir/worktree-merge.lock"
HOLDER="$LOCK_DIR/holder.json"

now_epoch() { date +%s; }
iso_now()   { date -u +%Y-%m-%dT%H:%M:%SZ; }
our_branch() { git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(detached)"; }
our_worktree() { git rev-parse --show-toplevel 2>/dev/null || pwd; }

read_holder_field() {
  [ -f "$HOLDER" ] || { echo ""; return; }
  python3 - "$HOLDER" "$1" <<'PY' 2>/dev/null || echo ""
import json,sys
try: print(json.load(open(sys.argv[1])).get(sys.argv[2],""))
except Exception: print("")
PY
}

write_holder() {
  python3 - "$HOLDER" "$(our_branch)" "$(our_worktree)" "$$" "$(iso_now)" "${1:-}" <<'PY'
import json,sys
json.dump(dict(branch=sys.argv[2],worktree=sys.argv[3],pid=int(sys.argv[4]),
               acquired_at=sys.argv[5],target=sys.argv[6]), open(sys.argv[1],"w"))
PY
}

# Age in seconds. Prefer holder.acquired_at; fall back to the lock dir's mtime so a
# holder that crashed *before* writing holder.json still ages into staleness, while a
# just-created lock (mtime ~now) reads as fresh and we keep polling.
holder_age_seconds() {
  local at then; at="$(read_holder_field acquired_at)"; then=""
  if [ -n "$at" ]; then
    then="$(python3 -c 'import sys,datetime as d;print(int(d.datetime.strptime(sys.argv[1],"%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=d.timezone.utc).timestamp()))' "$at" 2>/dev/null || echo "")"
  fi
  if [ -z "$then" ]; then
    then="$(python3 -c 'import os,sys;print(int(os.path.getmtime(sys.argv[1])))' "$LOCK_DIR" 2>/dev/null || echo "")"
  fi
  [ -n "$then" ] || { echo 0; return; }
  echo $(( $(now_epoch) - then ))
}

# NOTE: we deliberately do NOT use PID liveness for staleness. The lock is held
# across several short-lived CLI invocations (acquire, then merge, then release are
# separate processes), so the acquiring process has already exited by the time
# another session checks — its PID is always "dead". Time since acquisition is the
# only sound staleness signal, and matches the chosen "surface to user past a
# threshold" policy. The `pid` field in holder.json is kept for informational use.

cmd_acquire() {
  local threshold="$DEFAULT_THRESHOLD" budget="$DEFAULT_WAIT_BUDGET" target=""
  while [ $# -gt 0 ]; do case "$1" in
    --threshold) threshold="$2"; shift 2;;
    --wait-budget) budget="$2"; shift 2;;
    --target) target="$2"; shift 2;;
    *) shift;; esac; done
  local start; start="$(now_epoch)"
  while :; do
    if mkdir "$LOCK_DIR" 2>/dev/null; then write_holder "$target"; echo "ACQUIRED"; return 0; fi
    local age hb; age="$(holder_age_seconds)"
    if [ "$age" -gt "$threshold" ]; then
      hb="$(read_holder_field branch)"; echo "STALE holder=${hb:-unknown} age=${age}s"; return 2
    fi
    if [ $(( $(now_epoch) - start )) -ge "$budget" ]; then
      hb="$(read_holder_field branch)"; echo "WAITING holder=${hb:-unknown} age=${age}s"; return 3
    fi
    sleep "$POLL_INTERVAL"
  done
}

cmd_release() {
  [ -d "$LOCK_DIR" ] || { echo "free"; return 0; }
  # Ownership: accept release if our current branch is the holder's source branch
  # (main-session topology) OR its recorded target/integration branch. The
  # feature-session topology cd's from the feature worktree into the main worktree
  # before releasing, so by release time our branch is the integration branch — NOT
  # the feature branch the lock was acquired under. Matching on `target` (passed via
  # `acquire --target`) covers that without letting an unrelated branch release.
  local hb ht ours; hb="$(read_holder_field branch)"; ht="$(read_holder_field target)"; ours="$(our_branch)"
  if [ -n "$hb" ] && [ "$hb" != "$ours" ] && [ "$ht" != "$ours" ]; then
    echo "refuse: lock held by '$hb' (target '${ht:-?}'), not '$ours' — not releasing" >&2; return 1
  fi
  rm -rf "$LOCK_DIR"; echo "released"
}

cmd_status() {
  [ -d "$LOCK_DIR" ] || { echo "free"; return 0; }
  local hb; hb="$(read_holder_field branch)"
  echo "held holder=${hb:-unknown} age=$(holder_age_seconds)s"
}

cmd_steal() { rm -rf "$LOCK_DIR"; cmd_acquire "$@"; }

sub="${1:-}"; shift || true
case "$sub" in
  acquire) cmd_acquire "$@";;
  release) cmd_release "$@";;
  status)  cmd_status "$@";;
  steal)   cmd_steal "$@";;
  *) echo "usage: merge-lock.sh {acquire|release|status|steal}" >&2; exit 64;;
esac
