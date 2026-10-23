---
queue_item: rust-run-one-task
queue_hash: sha256:4d2a97f3245c15502eb26e193f4737d3e8fd0840e201957c5a30e06c8418387a
planner: null
date: 2026-10-21
---

### Goal

Join the run feature's pieces so Rust can run one approved task the way the watcher does: start the executor, check its result and scope, run the task and change verify, and record the outcome in the `.run/` files TypeScript reads.

### Context

As of 2026-10-21:

- The pieces come from `rust-run-task-prompt`, `rust-verify-command`, `rust-scope-audit` and `rust-pi-config`. The runner and pi harness landed in 246, 251 and 254.
- TypeScript runs a task in `runTask` in `src/watcher/runner.ts`, with the attempt, outcome and dead-marker files in `src/watcher/`.
- ADR 025: Rust writes today's `.run` markers and event JSONL as they are, so TypeScript can read what Rust wrote.

### Requirements

- `osq run <id> <n>` in Rust runs one task once and writes the running, done or dead markers and the events TypeScript writes for that outcome.
- A task is done only when osq's own task verify and change verify pass and the scope audit finds nothing.
- Tests run the committed fake pi from 260 on a fixture change, for a done, a verify-red and a scope-violation outcome.

### Non-goals

- Retries, baseline verify, mutation testing, worktrees, commits and the watcher loop; each is a later item.
