---
queue_item: rust-query-feature
queue_hash: sha256:4ea969ae6f03644c98fdbfb1d2ca018be2c1af7c79804f760b415905f393098f
planner: null
date: 2026-10-21
---

### Goal

The first Rust feature crate. `report` only displays the read model (Architecture page), and the storage kernel already builds all 16 `osq query` tables, so `osq query` is the smallest feature that exercises the `Feature` trait end to end.

### Context

As of 2026-10-21:

- `crates/features/report` is a placeholder. The storage kernel builds the read model with `build_read_model` and writes it with `write_read_model` into SQLite with the same tables as TypeScript.
- TypeScript: `src/core/report/query-run.ts` (`runQuery`, `formatTableList`, `QueryError`) and `query-tables.ts`. `osq query` with no argument lists the tables; with a select it prints the rows; it refuses anything but a read-only select.

### Requirements

- `osq-feature-report` implements core's `Feature` with a `query` command: no argument prints the table list, and a select prints its rows, both byte for byte as `runQuery` prints them.
- A statement that writes, or more than one statement, is refused with TypeScript's message.
- A golden test runs a fixed set of queries on a fixture read model and compares with output TypeScript printed once and committed. No test runs node.

### Non-goals

- `osq report`'s other sections, the dashboard, and CLI wiring.
