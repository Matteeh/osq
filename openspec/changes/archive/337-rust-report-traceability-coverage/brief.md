---
queue_item: rust-report-traceability-coverage
queue_hash: sha256:8426c43cb7aed7c2adf98864da0d68966826bb8b032b6d7bdd179999eac87ede
planner: null
date: 2026-10-24
---

### Goal

After the History section, TypeScript's report prints `Traceability:`, `Validation:` and `Coverage:`. Port them, in order, as the next part of the report.

### Context

As of 2026-10-24:

- TypeScript: `src/core/report/report-traceability.ts`, `report-validation.ts`, and the `Coverage:` block in `formatReport` in `src/core/report/report.ts`, with their `--json` members.
- Rust `crates/features/report` prints through the History section once `rust-report-history-sizes` lands, with goldens from TypeScript's `dist`.

### Requirements

- Rust `osq report` prints those three sections with TypeScript's text and numbers, after History, and in `--json`.
- Tests compare with TypeScript's `dist` on fixtures that fill each section and leave each empty.

### Non-goals

- `Planning:` and every later section.
