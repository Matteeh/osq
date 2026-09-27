---
queue_item: enable-vcs-for-osq
queue_hash: sha256:ce81e78dff4ed9ddc18d0b39e456f55ee4e828303febbc3bd0f0ccca1ea16741
planner: null
date: 2026-09-27
---

### Goal

osq's own changes run in worktrees on `osq/` branches from here on. This is the first change after stage 1, and the first real test of it.

### Context

- ADR 003 migration: every stage-1 change ran with the flag off; the flag turns on for the change after the stage.
- Approve refuses off the default branch without `--base-ok`, so approvals from here on happen on `main`.

### Requirements

- `osq.config.ts` sets `vcs.enabled: true`, `vcs.author`, and `vcs.prepare: 'pnpm install --frozen-lockfile'`.
- README.md documents the stage-1 flow: approve on the default branch, where the worktree is, not editing it while a task runs, and landing by hand with `osq message`.

### Non-goals

- Any code change.

### Notes for planning

- Ask the human which identity `vcs.author` should use.
- `osq doctor` should show no `vcs-prepare` warning afterwards.
