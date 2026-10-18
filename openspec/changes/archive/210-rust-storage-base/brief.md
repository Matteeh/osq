---
queue_item: rust-storage-base
queue_hash: sha256:e0ec71f29fa571c8622fa942c08e0a651d87fee499aa7a7c2e9d933d6c8d967b
planner: null
date: 2026-10-18
---

### Goal

Rust osq reads a project's active and archived changes from disk into core types, folds their events, and builds a SQLite read model that can be deleted and rebuilt, holding the first three of the 16 tables TypeScript's `osq query` serves, with rows equal to TypeScript's.

### Context

As of 2026-10-18:

- `crates/kernel/storage` is an empty skeleton depending only on `osq-core`. rust-core holds `Event`, `parse_event_line`, `Stream`, `TaskId`, the folds `apply_task`, `apply_change` and `apply`, `change_status`, `Seal` and the `Change` typestate.
- Decided on the Notion page "Storage kernel: design brief": SQLite from the start with `rusqlite` and its `bundled` feature, mirroring TypeScript's 16 tables over the track; events are the truth; an archived change's location wins over stale markers (`running` is left in 97 archived changes, 004 to 100, and `regressed` in 17); the replay corpus is the live archive, as `crates/core/tests/event_corpus.rs` reads it; capability `rust-storage` in group `rust`.
- The archive holds 205 changes, 700 tasks and 80,468 event lines. The rust-core task fold agrees with the `done/<n>` markers on every task from 014 on. All 37 disagreements are in 004 to 013, whose watcher wrote no `done` event. `change.jsonl` exists from 028 on and ends with `archived` from 038 on.
- TypeScript builds the tables in `src/core/report/query-tables.ts` and `archive-record.ts` into `node:sqlite`. `osq query --json "<select>"` prints rows as JSON. `osq query` lists the columns: `changes(id, folder, title, archived_on, goal, tasks, attempts, halts, elapsed_seconds, cost, planner)` with 207 rows, `tasks(change, task, title, attempts, done)` with 717, `dead_attempts(change, task, reason)` with 50.
- Rust code never reads, imports or calls anything under `src/` (AGENTS.md, Rust crates).

### Requirements

- The `rust-storage` capability in group `rust` owns `crates/kernel/storage/**`.
- Storage lists the active and archived change folders and reads one into a typed snapshot: its id, folder and location, its markers as core types where core has one, its task ids and titles, and the `ChangeState` folded from its event files. A malformed event line is an error naming the file and line, never skipped.
- An archived change reads as archived whatever its `running` or `regressed` markers say.
- Storage builds the SQLite read model from the files with the `changes`, `tasks` and `dead_attempts` tables, with TypeScript's column names and types. A test deletes the database, rebuilds it and gets the same rows.
- A replay test folds every archived change and checks the folded task statuses against its `done/` markers, and `archived` as a change's last event from 038 on. Changes 004 to 013 are a fixed, named list that only has to parse.
- A golden test compares every row of the three tables for archived changes 014 to 209 with rows taken from TypeScript's `osq query --json`, committed as fixtures. The test never runs node or osq.

### Non-goals

- The other 13 tables; they are `rust-storage-event-tables`, `rust-storage-file-tables` and, after the specs kernel, `requirements`.
- Parsing Markdown bodies or delta specs, which is the specs kernel's (ADR 026). Storage reads only the frontmatter fields its tables need.
- Computing the approval seal, which is its own change after the track.
- Any writing of markers or events.
