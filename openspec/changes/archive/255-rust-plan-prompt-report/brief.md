---
queue_item: rust-plan-prompt-report
queue_hash: sha256:3684212978c307fe33dbcdc25a796f1ca901956f71a4203bcf58fae825cec1f3
planner: null
date: 2026-10-21
---

### Goal

249 writes `plan-prompt.md` only up to `## Brief`. TypeScript then appends what the repository's history says, which planners read to size tasks. The Rust plan feature should write the same sections from the storage read model.

### Context

As of 2026-10-21:

- `crates/features/plan` writes the prompt through `## Brief` (249).
- TypeScript appends "This repository's record", "What history says" and "Recent executor disclosures", and the manual edits notice when there is one; see `src/cli/plan.ts`, `src/core/report/history-hints.ts` and `src/core/report/recent-disclosures.ts`.
- The storage kernel builds `task_outcomes` and the other `osq query` tables the sections read.

### Requirements

- After `## Brief`, the Rust plan prompt holds each section TypeScript writes, byte for byte, for the same repository.
- A test compares the sections for a fixture repository with text TypeScript printed for it, and a corpus test runs on this repository's archive.

### Non-goals

- The steering section, which needs run triggers the Rust loop does not read yet.
- Changing what TypeScript writes.
