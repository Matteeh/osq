---
queue_item: rust-report-history-counts
queue_hash: sha256:7b654eff189e98cf99aa6ab5ca0cafc56931cc928680e99b55fadeadca2ef796
planner: null
date: 2026-10-23
---

### Goal

305 ported the report's header, `Specs Summary:` and `Now:`. The next part is `History:` up to and including `Scope regressions:`, which tells a human how attempts, verifies and deaths went.

### Context

As of 2026-10-24:

- TypeScript prints it in `formatReport` in `src/core/report/report.ts`, from `Total attempts` through `Requeued for agent`, with `formatRetryHistoryLines` (`report-retries.ts`) and the pre-spawn lines (`report-pre-spawn.ts`).
- 305 built `crates/features/report` with goldens against TypeScript's `dist`. Storage reads event tables (211) and task outcomes (228).

### Requirements

- Rust `osq report` prints those History lines with TypeScript's text and numbers, in TypeScript's order after `Now:`, and in `--json`.
- Tests compare with TypeScript's `dist` on a fixture history with retries, dead reasons, rejections and scope regressions.

### Non-goals

- Rework, disclosures, dependencies, sizes and every later section; `rust-report-history-sizes` ports them.
- `--since` and `--until`.
