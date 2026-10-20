---
queue_item: ts-parallel-changes
queue_hash: sha256:a1a18a3f57c0d342ee8191b6fef3a32f83f4ff0b18898ead92fba1b75a5e0509
planner: null
date: 2026-10-20
---

### Goal

The rest of the Rust rewrite runs in parallel lanes now, not after the Rust loop exists: approved changes that don't overlap run side by side in their own worktrees, so work on separate crates no longer waits in line.

### Context

As of 2026-10-20:

- `runWatcherCycle` in `src/watcher/loop.ts` walks the active changes one by one and awaits each change's task (often 10 to 30 minutes) before it looks at the next change. The function is grandfathered over the function budget and the file over the line budget.
- `maxConcurrency` is in `OsqConfig` (default 1, osq's own config sets 1) but nothing reads it.
- Overlap is already handled at approve (change 170, `src/core/spec/stack-overlap.ts`): a change whose delta shares a capability with an approved or archived unlanded change stacks behind it and waits, so approved changes that are not stacked are independent. Every change runs in its own worktree with its own branch, `.run/` markers and running lock, and land stays one at a time through the stacked-land bridge.
- ADR 027 (`decisions/027-rust-scheduling.md`) says in its Status section that TypeScript osq keeps running one change at a time and that its watcher does not change. That line has to change with this item.
- The executor is pi with DeepSeek flash; each worktree builds its own Rust target, so parallel changes cost CPU and tokens.

### Requirements

- The watcher starts the next task of up to `maxConcurrency` approved, unstacked changes at once, and leaves a change whose task is still running alone until it finishes. A restart loses nothing: what is running comes from the running locks on disk.
- A stacked change still waits for the change it stacks on, an active pause still stops every new start, and with `maxConcurrency: 1` the watcher behaves exactly as today.
- Tests with the mock harness prove two independent changes run at the same time, a stacked change waits, the cap holds, and a pause stops new starts.
- osq's own `osq.config.ts` sets `maxConcurrency: 3`.
- ADR 027's Status line says TypeScript osq runs independent approved changes in parallel, with overlap by capability as change 170 decides it, until the Rust loop replaces it; ADR 021's autopilot stays one item at a time.

### Non-goals

- File-level or crate-lock overlap in TypeScript; that is the Rust scheduler's job.
- Parallel tasks inside one change.
- Parallel planning, parallel landing, or changes to autopilot.
