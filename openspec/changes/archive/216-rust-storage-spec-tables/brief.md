---
queue_item: rust-storage-spec-tables
queue_hash: sha256:6da3f7c2f390db485909345d6d593990435bc5bfe2eeeb6b5843bc4f710af45b
planner: null
date: 2026-10-18
---

### Goal

The Rust read model holds every table TypeScript's `osq query` serves, with rows equal to TypeScript's.

### Context

As of 2026-10-18:

- Storage (210 to 212) holds 14 of the 16 tables. `requirements` and `task_outcomes` were deferred because they need delta spec and task file parsing, which ADR 026 gives the specs kernel.
- TypeScript builds `requirements(change, capability, kind, requirement, renamed_from)` in `src/core/report/query-tables.ts`, one row per delta requirement, a rename keyed on its new name. It builds `task_outcomes` in `src/core/report/task-outcomes.ts` (`deriveTaskOutcomes`, `verifyKind`).
- `osq query` lists each table's columns, and `osq query --json "<select>"` prints its rows.

### Requirements

- Storage builds `requirements` and `task_outcomes` with TypeScript's column names and types, from the specs kernel's parse rather than its own.
- The golden test of storage's rows covers both tables, from rows taken once from TypeScript's `osq query --json` and committed as fixtures.
- The rebuild test still gets the same rows after deleting the database.

### Non-goals

- Any change to the other 14 tables, or to TypeScript's tables.
