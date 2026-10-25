---
planner: null
date: 2026-10-25
---

### Goal

Rust core reads every dead and retry reason TypeScript writes, so `sh scripts/verify-rust.sh` is green on main again and 342 can be retried.

### Context

As of 2026-10-25:

- TypeScript's own-folder gate (317) records the dead reason `own_folder_path` (`src/watcher/failure-reason.ts`, `src/watcher/own-folder-gate.ts`). Archived change 340 holds a `dead` and a `retry` event with it in `.run/events/1.jsonl`.
- Rust core's `DeadReason` and `FailureReason` in `crates/core/src/event/reasons.rs`, and the rust-core "Reason and outcome values" table, lack it. `crates/core/tests/event_corpus.rs` parses every archived event and fails on main, so 342 task 1 died `blocked` on the change verify.
- A scan of the whole archive found no other reason or outcome value Rust does not know.

### Requirements

- `DeadReason` and `FailureReason` gain `own_folder_path`, in TypeScript's order: last in `DeadReason`, and after `scope_violation` in `FailureReason`'s dead-reason part.
- The rust-core "Reason and outcome values" table lists it, and every Rust test passes, the event corpus test included.

### Non-goals

- A gate that keeps TypeScript's reason lists and Rust's in step; that is a separate queue item.
- Any other event change.
