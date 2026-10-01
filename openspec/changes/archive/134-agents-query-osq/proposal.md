---
title: Agents read osq's history as rows, through osq
depends_on: []
verify: pnpm verify
features:
  reads:
    - spec-lint-and-approve
    - status-inspection
    - web-inspection
---
## Goal

A planner or executor that needs a fact from osq's history, such as which
tasks died of `scope_violation` or which changes touched a capability, runs
one command and gets a few rows instead of opening event files.

`osq query "<select>"` runs one read-only SQL `SELECT` over five documented
tables of archived changes: `changes`, `requirements`, `tasks`,
`dead_attempts` and `disclosures`. It prints the rows tab-separated, or as JSON
with `--json`. `osq query` alone lists the tables and their columns. Anything
that would write, or read anything but those tables, is refused. `PLANNER.md`
and the executor protocol name the command.

The tables are built for each call in an in-memory database, from the archive
records `osq digest` already reads, with event streams read through the 133
index. On this repository a call builds them in about 1.2 s with a warm index.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint.
`tests/query-tables.test.ts` proves each table's rows for a fixture archive.
`tests/query-command.test.ts` proves the command's output and every refusal.
`tests/query-blocks.test.ts` proves the managed blocks name the command.

## Non-goals

- Active or rejected changes. The tables hold archived changes only.
- Network access, a server endpoint, or dashboard use of the tables.
- Writing through `osq query`, or a persistent copy of the tables. They are
  rebuilt from files on every call.
- A row cap. Agents add `LIMIT`; the managed blocks say so.
- Replacing the plan prompt's record sections.
- Exposing the index's own layout. Its `streams` table can change without
  changing any query table.

## Surface

- Added: `osq query [select]` (command), with `--json` (flag).
- Added: the query tables `changes`, `requirements`, `tasks`, `dead_attempts` and `disclosures`, and their columns (document sections in the metrics-and-reporting spec).
- Changed: `PLANNER.md` and the executor protocol in `AGENTS.md` each gain one line naming `osq query` (document sections).

## Decisions

- ADR 001: unchanged; nothing here loads config differently.
- ADR 004: unchanged; nothing here runs the OpenSpec validator.
- ADR 005: unchanged; nothing here checks the validator range.
- ADR 008: the query uses the index only to read event streams faster; its
  tables are rebuilt from the files on every call and stored nowhere.

## Contract

### Requirement: History query

`osq query` SHALL answer one read-only `SELECT` over documented tables of
archived changes, and SHALL refuse every other statement.

#### Scenario: Dead reasons
- **WHEN** an agent runs `osq query "select reason, count(*) from dead_attempts group by reason"`
- **THEN** osq prints one tab-separated row per reason with its count, under a header row

#### Scenario: A write
- **WHEN** an agent runs `osq query "delete from changes"`
- **THEN** osq refuses it, lists the tables, exits non-zero, and changes no file

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/metrics-and-reporting/spec.md`: adds "History query tables", "History
  query command", and "History query safety"; modifies "Report index location"
  and "Code ownership".
- `specs/cli-foundation/spec.md`: adds "History lookup in managed blocks".

Three tasks, in order. Task 1 builds the tables. Task 2 adds the command and
reads task 1's module without changing it. Task 3 changes the managed blocks.
No file is shared between tasks.

## Background

**Measured on 2026-10-01** on this repository at 133, with a rough version of
the tables built through `tsx` against the real archive: 133 changes, 1,203
requirement rows, 458 tasks, 20 dead attempts and 462 disclosures, about
214 KB of disclosure text. `select reason, count(*) from dead_attempts group by
reason` and a join of `changes` with `requirements` on a capability both
answered correctly.

| Building the tables | Time |
| --- | --- |
| No index | about 3.7 s |
| Warm index, archive reader reading files itself | about 1.7 s |
| Warm index, archive reader through the shared reader | about 1.2 s |

**Why task 1 routes the archive reader.** `readArchivedRunFields` in
`archive-record-run.ts`, which `osq digest` uses, reads every event stream with
`fs.readFile` and `parseEventLines`, so it bypassed both 132's shared reader
and 133's index. Routing it through `readEventStream` saved about 0.5 s per
call. Outside a read scope `readEventStream` still reads from disk, so `osq
digest` reads as before; its events lose only the verify logs, which the digest
never prints. All digest tests passed with the change.

**Why tables in memory, not views in the index.** The brief proposed views over
the index. The index holds only event streams, while the tables need titles,
goals, deltas, task files and result files. Building them per call from the
same readers `osq digest` uses keeps one source of truth, nothing to keep in
sync, and an index layout free to change, at the cost of about a second per
call.

**Read-only by SQLite's authorizer.** `node:sqlite` on Node 24.21 has
`setAuthorizer`. Tried on 2026-10-01: allowing only `SQLITE_SELECT`,
`SQLITE_READ` of the five tables, `SQLITE_FUNCTION` and `SQLITE_RECURSIVE`
refused `INSERT`, `DELETE`, `PRAGMA`, `ATTACH`, and a read of `sqlite_master`,
and allowed `WITH` and functions such as `upper`. `prepare` compiles only the
first statement and silently drops the rest, so osq compares the input with
the statement's `sourceSQL` and refuses any text after the first statement.

**Managed blocks.** The executor line goes under "Where things live", which
the executor prompt fixtures don't include, so no prompt fixture changes. In
a scratch worktree the wording failed only `tests/managed-blocks.test.ts`, until
`.opencode/agent/osq-coder.md` got the same line. That file is this
repository's installed opencode executor agent and carries the executor block.
`CLAUDE.md` is a symlink to `AGENTS.md`.

**No row cap.** `src/core/foundation/config.ts` is at 249 of 250 lines, and
every limit must come from config. The blocks tell agents to add `LIMIT`.
