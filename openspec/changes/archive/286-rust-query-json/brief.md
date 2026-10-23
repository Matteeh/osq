---
queue_item: rust-query-json
queue_hash: sha256:7d0b925e8d93f685362efa6e5d95d47f0bfdafa25d694b34d99f1b38cce300ac
planner: null
date: 2026-10-22
---

### Goal

`osq query --json` gives agents rows they can parse. 243 left it out of Rust because matching `JSON.stringify` number formatting byte for byte was risky for output nothing used yet. Agents read history through `osq query`, so Rust should give the same JSON.

### Context

As of 2026-10-22:

- TypeScript prints it from `src/cli/query.ts` (`--json`: "print the rows as a JSON array of objects").
- The Rust query lives in `crates/features/report/src/query*` (243), over the storage kernel's SQLite tables.

### Requirements

- `osq query --json "<select>"` in Rust prints the same bytes TypeScript prints for text, integer, real and null columns, an empty result and a refused statement.
- Goldens are printed by TypeScript's built `dist` from a fixture database and committed in the change folder.

### Non-goals

- JSON output for any other command.
