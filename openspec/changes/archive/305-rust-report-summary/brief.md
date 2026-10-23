---
queue_item: rust-report-summary
queue_hash: sha256:a4036c8eae6e03ce890d904914d382590827682ed76c74089ae23ad700842678
planner: null
date: 2026-10-22
---

### Goal

`osq report` is how a human sees how osq is doing, and Rust has no `osq report`. TypeScript's report is large, so port it in slices, starting with the header, `Specs Summary:` and `Now:` sections, which read only the current change files.

### Context

As of 2026-10-23:

- TypeScript builds the report in `buildMetricsReport` and prints it in `formatMetricsReport`, both in `src/core/report/report.ts`, called from `src/cli/report.ts`. `--json` prints the sorted report object through `serializeSortedJson`.
- Rust: `crates/features/report` holds `osq query` (243, 286). The storage kernel reads every change's marker files.

### Requirements

- Rust `osq report` prints `osq Delivery Metrics Report`, then the `Specs Summary:` and `Now:` sections with TypeScript's text and counts, including the completion rate.
- Rust `osq report --json` prints the same fields under TypeScript's keys, sorted as TypeScript sorts them.
- Goldens are printed by TypeScript's `dist` from fixture projects and committed in the change folder.

### Non-goals

- The `History:` section and every later section; later items port them.
- `--since` and `--until`.
