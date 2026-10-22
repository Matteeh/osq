---
queue_item: rust-run-usage-pause
queue_hash: sha256:cf5522fa6108cd3b320bc515edc44dd576ab45156dfadc427ef51fd828b9cd20
planner: null
date: 2026-10-22
---

### Goal

When the executor hits a usage limit, TypeScript writes a pause and doesn't count the attempt as a failure. The Rust run fails with no marker, so the task is neither paused nor retried.

### Context

As of 2026-10-22:

- TypeScript writes `.run/paused.md` and the `usage_limit` event in `src/watcher/usage-pause.ts` and `src/core/run/usage-pause.ts`. The inbox reads the pause (280).
- The runners kernel already has `find_usage_limit` and `pause_until` in `crates/kernel/runners/src/pause.rs`. `rust-run-attempts` passes the attempt to the prompt.

### Requirements

- When the fake pi reports a usage limit, Rust `osq run <id> <n>` writes the pause file and events TypeScript writes, leaves no dead marker and keeps the attempt count.
- Tests use the committed fake pi.

### Non-goals

- Resuming on its own when the pause ends; that belongs to the loop.
