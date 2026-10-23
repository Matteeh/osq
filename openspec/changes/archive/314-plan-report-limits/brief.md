---
queue_item: plan-report-limits
queue_hash: sha256:9a21c272b5e6f8dc61910a294606170256989b8c427b7a5e0d23c80757e7b642
planner: null
date: 2026-10-23
---

### Goal

Every limit comes from config, but the report that opens each plan prompt still hard-codes sizes. TypeScript reads most of them from the `planning` block but keeps the repository record's three sizes as constants. Rust reads none of them: its config has no `planning` block, so the plan feature hard-codes all eight.

### Context

As of 2026-10-23:

- TypeScript: `planning.disclosures` (`recentChanges` 3, `maxCharacters` 4000) and `planning.history` (`minimumTasks` 30, `recentTasks` 100, `maxCharacters` 1500) in `src/core/foundation/config-planning.ts`. The record sizes `REPOSITORY_RECORD_MIN_MEASURED_TASKS` (5), `REPOSITORY_RECORD_MAX_ARCHIVED_CHANGES` (20) and `REPOSITORY_RECORD_MAX_DEAD_OUTCOMES` (10) are constants in `src/core/report/report.ts`.
- Rust: `crates/features/plan/src/next/report/hints.rs` (30, 100, 1500), `record.rs` (5, 20, 10, and the "too small" text with 5 in it) and `disclosures.rs` (3, 4000). ADR 029 and 252 give the config kernel one module per block under `crates/kernel/config/src/blocks/`.

### Requirements

- TypeScript gains a `planning.record` block with the three record sizes and today's values as defaults, and `report.ts` reads it.
- The Rust config kernel reads the `planning` block's `disclosures`, `history` and `record` tables with TypeScript's keys, defaults and refusals, and the Rust plan report takes every size from it.
- The record's "too small" text names the configured value in both languages.
- With the defaults, every plan prompt and golden stays byte for byte the same.
- Tests in both languages set a key to a small value and see the shorter section.

### Non-goals

- Changing any default.
- `planning.idleGapMinutes` and `planning.prices` in Rust.
