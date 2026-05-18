---
title: "Plan — Hello-Cadence"
created: 2026-01-15
updated: 2026-01-15
status: completed
tags: [plan, hello-cadence, example]
linked_design: 2026-01-15-hello-cadence
base_sha: 7d9f3a1c2e4b8a5d6f0e1b9c3a7d2e5f8b4a6c9d
---

# Hello-Cadence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/c-execute` to drive this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `hello_cadence.now.current_time_iso()` and its test per the design.

**Architecture:** Single module under `src/hello_cadence/`. Tests under `tests/`. Standard Python packaging — `pyproject.toml`, no other config.

**Tech Stack:** Python 3.12+, pytest, datetime (stdlib).

**Design:** [[../../designs/2026-01-15-hello-cadence/00-overview]]

## Plan Index

- [[01-implementation]] — Tasks 1.1-1.2: module + test

## File Map

| File | Action | Phase | Notes |
|---|---|---|---|
| `pyproject.toml` | Create | 01 | Minimal: name, version, pytest dependency |
| `src/hello_cadence/__init__.py` | Create | 01 | Empty package marker |
| `src/hello_cadence/now.py` | Create | 01 | `current_time_iso()` + `__main__` entry |
| `tests/test_now.py` | Create | 01 | Pattern test |

> [!note] This example carries `status: completed` and a populated `base_sha`
> because it represents a finished worked plan readers can study. In your own
> plans, `status` starts at `draft`, `base_sha` starts at `null`, and they
> advance through the lifecycle as you run `/c-execute` and `/c-validate`.
