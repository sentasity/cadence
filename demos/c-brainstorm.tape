# demos/c-brainstorm.tape
#
# Records a REAL /c-brainstorm session (no faked output) inside a scratch fixture
# repo built by demos/setup-fixture.sh. Regenerate with `make demos`.
#
# Requires: vhs (brew install vhs), the claude CLI with the cadence plugin
# installed, and API auth. Each render runs a real Claude session (costs tokens).
#
# How nondeterminism is handled:
#
# 1. Timing: every model-latency gap is wrapped in Hide ... Wait ... Show, so no
#    idle frames land in the GIF. The GIF stays short no matter how long Claude
#    thinks; total runtime is dominated by the Sleep lines below (~28s).
# 2. Wording: Waits match stable Claude Code UI chrome, verified against v2.1.206:
#    "accept edits on" in the status bar once the session is ready, and
#    "Enter to select" in the AskUserQuestion picker footer (present only while a
#    picker is active, so each Wait matches the NEXT question, not scrollback).
#    The final wait matches "Run /c-design", guaranteed by the skill's exit gate.
# 3. Answers: every gate in /c-brainstorm is an AskUserQuestion picker whose
#    FIRST option is the (Recommended) one (hard gate in the skill). So the
#    answer keystroke is always plain Enter, regardless of exact option text.
# 4. Question count: the fixture's CLAUDE.md pins the session shape (two
#    questions, approach proposal, write confirmation). If a run still deviates,
#    a Wait times out, vhs exits nonzero, and the Makefile retries fresh.
#
# CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC and --strict-mcp-config keep the
# startup screen free of promo banners and MCP-auth warnings.

Output "demos/c-brainstorm.gif"

Require claude
Require git

Set Shell "zsh"
Set FontSize 15
Set Width 1100
Set Height 720
Set Padding 12
Set TypingSpeed 35ms
Set WaitTimeout 240s
Set Framerate 20
Set Theme "Catppuccin Mocha"

Env FIXTURE "demos/.build/credit-ledger"
Env CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC "1"

# --- Launch (hidden): enter the fixture and start claude ---
Hide
Type `cd "$FIXTURE" && claude --permission-mode acceptEdits --strict-mcp-config`
Enter
# Matches the first-run trust dialog (if any) or the ready status bar.
Wait+Screen@60s /trust the files|accept edits on/
# Accepts the trust dialog if it appeared; harmless no-op at an empty prompt otherwise.
Enter
Wait+Screen@60s /accept edits on/
Show
Sleep 1s

# --- The demo proper ---
Type "/c-brainstorm I want to add a credit ledger that shows AWS credits per account"
Sleep 800ms
Enter

# Q1: subsystem pick. Hidden wait for the AskUserQuestion picker, then select
# the Recommended option (always listed first).
Hide
Wait+Screen /Enter to select/
Show
Sleep 5s
Enter
Sleep 1s

# Q2: credit-sharing model.
Hide
Wait+Screen /Enter to select/
Show
Sleep 5s
Enter
Sleep 1s

# Approach proposal pick.
Hide
Wait+Screen /Enter to select/
Show
Sleep 5s
Enter
Sleep 1s

# "Writing 00-overview.md. Proceed?" confirmation.
Hide
Wait+Screen /Enter to select/
Show
Sleep 3s
Enter
Sleep 1s

# Handoff line, guaranteed by the skill's exit gate.
Hide
Wait+Screen /Run \/c-design/
Show
Sleep 5s
