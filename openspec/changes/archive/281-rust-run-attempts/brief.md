---
queue_item: rust-run-attempts
queue_hash: sha256:e160c345755b0eac7bb9ee270608bbbd7bd0e459e3e68cd1d4983b9c4ae3a371
planner: null
date: 2026-10-22
---

### Goal

A retried task should know which attempt it is and why the last one failed, as TypeScript's executor prompt says. The first Rust run reads neither.

### Context

As of 2026-10-22:

- TypeScript reads them in `readRetryContext` in `src/watcher/attempt.ts`, from the `retry` and `recertification` events, and hands them to the prompt.
- 267's `executor_prompt` takes a `PriorAttempt` from its caller. `rust-retry` writes the `retry` event.

### Requirements

- `osq run <id> <n>` in Rust reads the attempt and prior failure from the task's events as TypeScript does, and passes them to the executor prompt.
- Tests cover a first run, a run after a retry, and a run after a requeued recertification.

### Non-goals

- Automatic retries and the usage-limit pause.
