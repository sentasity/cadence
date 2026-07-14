# Demo recordings

Terminal GIFs for the README, recorded with [VHS](https://github.com/charmbracelet/vhs)
against a real Claude Code session, so the demos cannot drift from what the
skills actually do.

## Layout

- `*.tape`: one VHS script per demo (currently `c-brainstorm.tape`).
- `setup-fixture.sh`: rebuilds the scratch repo the tapes record inside
  (`demos/.build/acme-api`, gitignored). Recordings never touch the real repo.
- `*.gif`: the rendered output, committed so the README can embed it.

## Prerequisites

- `brew install vhs` (pulls in ttyd and ffmpeg)
- The `claude` CLI, authenticated, with the cadence plugin installed. The
  recording uses whatever plugin version is installed; record from a checkout
  of the version you are releasing.

## Recording

```sh
make demos
```

This rebuilds the fixture and renders every tape, retrying up to three times
per tape. Each render runs a real Claude session and costs real tokens.

## How the tapes stay stable

Claude's wording and timing vary run to run, so the tapes never depend on
either:

- Latency gaps are wrapped in `Hide`/`Wait`/`Show`, so thinking time adds zero
  frames to the GIF.
- `Wait+Screen` patterns match UI chrome and skill-contract strings, not prose.
- Every answer is plain Enter: `/c-brainstorm`'s hard gate puts the
  `(Recommended)` option first in every AskUserQuestion.
- The fixture's `CLAUDE.md` pins the session shape (question count and topics).
  A run that deviates times out a `Wait`, fails the render, and is retried.

If a tape keeps timing out, run `vhs demos/<name>.tape` by hand and check
whether the picker chrome pattern in the tape still matches Claude Code's
current AskUserQuestion rendering.
