---
queue_item: rust-retry
queue_hash: sha256:f20f55c367436396fdb0a9459a0169358b97ad239f8f4cf8ab48e1a43eaf71fd
planner: null
date: 2026-10-22
---

### Goal

A human retries a task or a change after it dies or regresses. Rust has no retry, so a Rust run could not be retried without TypeScript.

### Context

As of 2026-10-22:

- TypeScript retries in `retrySpec` in `src/core/lifecycle/retry.ts`, called from `src/cli/retry.ts`. It checks approval, running state and failure before writing, keeps each cleared marker as history, and appends a `retry` event that `readRetryContext` in `src/watcher/attempt.ts` reads.
- ADR 025: Rust writes the `.run` markers and events TypeScript reads.
- `rust-feature-scaffolds` gives an empty `osq-feature-retry` crate.

### Requirements

- `osq retry <id> <n>` and `osq retry <id> change` in Rust make the same file and event changes TypeScript makes, and refuse what TypeScript refuses, with its text.
- Tests compare the `.run` tree after a Rust retry with the tree TypeScript's `dist` leaves on the same fixture.

### Non-goals

- Retrying an after-land command, and stale-lock recovery of a killed watcher.
