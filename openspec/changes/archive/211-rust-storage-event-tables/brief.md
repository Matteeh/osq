---
queue_item: rust-storage-event-tables
queue_hash: sha256:b09fcc6ce07b407a9afa6c186408da44851425206444358c8d0e2fe46bc50d60
planner: null
date: 2026-10-18
---

### Goal

The Rust read model holds the nine `osq query` tables TypeScript builds from event streams, with rows equal to TypeScript's.

### Context

As of 2026-10-18:

- After `rust-storage-base`, storage reads every change's event files into typed `Event`s and builds `changes`, `tasks` and `dead_attempts` in SQLite.
- The nine tables, with their TypeScript builders under `src/core/report/` and their rows over the archive today: `pauses` (`query-pauses.ts`, 0 rows), `recertifications` (`query-recertifications.ts`, 44), `notices` (`query-notices.ts`, 251), `focused_runs`, `mutation_picks` and `mutation_survivors` (`query-task-streams.ts` and `query-run.ts`, 0 each), `validator_runs` and `validator_findings` (`query-validator.ts`, 50 and 0), and `link_findings` (`query-link-findings.ts`, 1). `osq query` lists their columns.
- Five of them have no row in the archive, so a golden test over the archive proves nothing for them.

### Requirements

- Storage builds the nine tables with TypeScript's column names and types, from the events storage already reads.
- A golden test compares their rows for archived changes 014 to 209 with rows from TypeScript's `osq query --json`, committed as fixtures.
- Each table with no archived row gets a fixture change folder whose events give at least one row, with expected rows taken from TypeScript's `osq query --json` on that folder.

### Non-goals

- Tables built from files other than event streams; that is `rust-storage-file-tables`.
- Any new event type or field in rust-core.
