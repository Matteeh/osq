---
queue_item: rust-run-baseline-verify
queue_hash: sha256:759fc0ca2c397dc0785783e69158655bb13f2f0eaf5085cf1a46a8109975f43a
planner: null
date: 2026-10-23
---

### Goal

TypeScript runs a task's verify once before the first attempt and kills the task when the result contradicts its `verify_starts`, so a verify that proves nothing never certifies a task. The Rust run skips that check.

### Context

As of 2026-10-22:

- TypeScript runs it in `src/watcher/runner.ts`, keyed by `src/watcher/baseline-key.ts`, with the dead reason from `src/watcher/failure-reason.ts`.
- `run_verify` in the harnesses kernel runs the verify (268). `rust-run-worktree` gives the tree the verify runs in.

### Requirements

- Before a task's first attempt, Rust `osq run <id> <n>` runs its verify once, records the baseline as TypeScript does, and writes TypeScript's dead marker and event when the result contradicts `verify_starts`.
- A later attempt reuses the recorded baseline.
- Tests cover red, green and any for both outcomes.

### Non-goals

- Running the change-level baseline.
