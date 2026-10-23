---
queue_item: rust-run-task-prompt
queue_hash: sha256:c15fb762848571f6ea15c73f40f25e2d832dbd647954cff4669950a4bdf1a14b
planner: null
date: 2026-10-21
---

### Goal

The run feature is a placeholder. Its first piece is the prompt an executor gets for one task: which task, change and spec files to read, and the protocol to follow, equal to what TypeScript hands the executor today.

### Context

As of 2026-10-21:

- `crates/features/run/src/lib.rs` holds only its doc comment, and `rust-run` holds only its Code ownership.
- TypeScript builds the prompt in `buildExecutorPrompt` in `src/harness/prompt.ts`, with `deltaSpecPaths` and `livingSpecPaths`.
- The specs kernel reads proposals, task files and deltas (`read_proposal`, `read_task_file`, `read_delta`).

### Requirements

- The run feature gives the executor prompt for a change folder and task number, byte for byte equal to TypeScript's for the same inputs.
- Goldens are printed by TypeScript's built `dist` from fixture changes and committed in the change folder.

### Non-goals

- Starting the harness, running verify or writing any marker.
