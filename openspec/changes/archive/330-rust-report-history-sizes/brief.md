---
queue_item: rust-report-history-sizes
queue_hash: sha256:6980b2b6bd759403179cc29b38ee26d81f9611b9a43845cbbfa8ad2835b30257
planner: null
date: 2026-10-24
---

### Goal

Finish the report's `History:` section after its counts: the rework, disclosures and dependencies blocks and the size buckets that planners use to size tasks.

### Context

As of 2026-10-24:

- TypeScript: `formatRework`, `formatDisclosures`, `formatDependencies` and the `Size by scope files`, `Resolver 2 starts at`, `Size by acceptance lines` and largest-pass lines in `src/core/report/report.ts`, with `report-dependencies.ts`, `record-rework.ts`, `record-disclosures.ts` and `scope-size.ts`.
- The Rust plan prompt's repository record (255, 314) may already compute some of these measures; reuse what fits.

### Requirements

- Rust `osq report` prints the rest of the History section with TypeScript's text, in its order, and in `--json`.
- Tests compare with TypeScript's `dist` on fixtures that fill each block and leave each empty.

### Non-goals

- `Coverage:`, `Planning:` and every later section.
