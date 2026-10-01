# osq queue

The remaining work on osq itself, as an osq brief queue.

Each item's body becomes that change's `brief.md` word for word. Drive the run with `osq plan --next`, then plan the change in a Claude Code session, review it, and `osq approve`.

The previous queue drove changes 103 to 131 and finished on 2026-10-01. A copy is in Notion under OSQ > Archive, "osq queue, 2026-09-27 to 2026-10-01 (completed)", and in git history.

This queue makes osq's own data cheap to read, for people and for agents. It is three items, queued on 2026-10-01 from the Notion page "SQLite read index: fast queries over osq's files". `report-reads-once` comes first, because that page says to profile `osq report` before building an index, and profiling found most reads are repeats. `sqlite-read-index` builds the index. `agents-query-osq` gives agents rows instead of event files, which is what is left of the planning-cost work after 119 to 121.

`report-small-reads-once`, queued on 2026-10-01 while planning 133, extends 132's read-once to the small files the report still reads several times. Measuring 133 showed they, not event streams, are most of what is left.

osq reads only the `## [slug]` items below. Everything above the first item is for people.

## [report-reads-once] osq report reads each event file once

Depends on: nothing

### Goal

One `osq report` run reads each `.jsonl` file under `.run/events/` and each `plan.jsonl` at most once, and prints exactly what it prints today.

### Context

As of 2026-10-01, measured on osq's own repository:

- `osq report` takes about 5.8 s. It took 4.2 s on 2026-09-29; it grows with every archived change. `osq status` takes about 0.3 s.
- The archive holds 644 `.jsonl` files and 109 MB of event data.
- One report run opens 730 distinct `.jsonl` files 3,593 times, up to 7 times each. By caller: `src/core/report/report.ts` 2,064, `planning-records.ts` 461, `report-dependencies.ts` 454, `approval-flags.ts` 303, `planning-economics.ts` 283, `src/core/status/queue-report-detail.ts` 27.
- A CPU profile puts about 0.9 s in `parseEventLines` in `src/core/report/report-events.ts` and about 0.5 s in string decoding, both proportional to the number of reads.
- `report.ts` reads task and change streams in several functions, each with its own `fs.readFile`: `readTaskMetadata`, `readFirstTaskStartMs`, `readArchivedAtMs`, the change-stream scan in `getMetricsReport`, and the rejection check. `report.ts` is 2,027 lines and on the line-budget allow list; `getMetricsReport` and `formatMetricsReport` are on the function-budget grandfather list.

### Requirements

- A report run reads each event stream and each `plan.jsonl` at most once, and parses it at most once.
- `osq report`, `osq report --json`, and every other command that uses these readers print byte-identical output before and after.
- Whatever holds the parsed streams lives for one command run and is never written to disk. Nothing about it survives the command.
- A test proves the read count: it runs the report over a fixture with several archived changes and asserts no event file is opened twice.

### Non-goals

- A persistent index or cache. That is `sqlite-read-index`.
- Changing what events carry, including the full verify log in `verify_ran`.
- Making `status`, the inbox, or the dashboard faster; they are not slow.

### Notes for planning

- Measure the fallout first: report output is pinned by tests, and `report.ts`'s grandfathered functions must not grow.
- Report the before-and-after time for `osq report` on this repository in the proposal's Background, so `sqlite-read-index` starts from the real number.

## [sqlite-read-index] osq report reads archived changes from a SQLite index that is always safe to delete

Depends on: report-reads-once

### Goal

`osq report` stays fast as the archive grows, because what it needs from archived changes is read once into a local SQLite index and reused. The files stay the only source of truth: deleting the index changes nothing but the next run's speed.

### Context

As of 2026-10-01:

- Node 24.21 ships `node:sqlite` (`DatabaseSync`, SQLite 3.53.4). It loads without an experimental warning, and `@types/node` 24 types it. `package.json` requires Node 24 or later. So the index needs no new runtime dependency and no dependency ADR. Check its stability level in the Node 24 docs before relying on it, and fall back to reading the files when the module is missing.
- AGENTS.md: "Any index or cache is derived from the files and may be deleted at any time."
- An archived change never changes once landed, except that `osq land` can append to its `change.jsonl`. Active changes live in their own worktrees, each with its own `.run/`.
- `osq land` commits each change's `.run/events/*.jsonl` to the default branch, so the index must stay out of git.
- `report-reads-once` leaves one place where report reads and parses each stream. Its proposal records the report time after that change; start from that number.
- The Notion page "SQLite read index: fast queries over osq's files" has the full reasoning: why the files stay truth (git, worktrees, fixed writers, restart safety), the incremental rebuild by size and mtime, and the AI access idea that `agents-query-osq` takes up.

### Requirements

- osq keeps a SQLite index of what `osq report` reads from archived changes. It lives outside git: either a git-ignored path in the project or under the user's `~/.osq/`, next to the worktrees. Decide which in planning. If it lives in the project, `osq init` adds it to the consumer's `.gitignore`.
- The index is rebuilt, per file, whenever that file's size or mtime differs from what the index recorded. A file that no longer exists drops out of the index.
- Deleting the index, or a corrupt or unreadable index, is never an error. The next command rebuilds what it needs and prints the same result.
- `osq report` reads archived changes through the index and active changes from the files. Its output is byte-identical to reading everything from the files.
- An ADR records the decision: SQLite is a derived read index, files remain the source of truth, nothing writes state only to the index, and only osq's own code opens it.
- Two osq commands running at once never corrupt the index. A command that can't write it reads the files instead and prints the same result.

### Non-goals

- Moving any state, marker or event out of files.
- Indexing anything `osq report` does not read.
- `status`, the inbox and the dashboard reading through the index. A later change can, once this one shows the shape holds.
- A query command. That is `agents-query-osq`.

### Verify

`pnpm verify`, plus tests:

- report output from the index equals report output from the files, over a fixture archive
- deleting the index, then reporting, gives the same output and rebuilds it
- a corrupt index file is replaced, not reported as an error
- appending a line to an archived `change.jsonl` updates that change in the index on the next run
- a removed archive drops out of the index

### Notes for planning

- Name the capability that owns the index in its Code ownership; a new capability needs `creates` and a reason it isn't metrics-and-reporting.
- Record the report time on this repository before and after in the proposal's Background.

## [agents-query-osq] Agents read osq's history as rows, through osq

Depends on: sqlite-read-index

### Goal

A planner or executor that needs a fact from osq's history, such as which tasks died of `scope_violation` in a capability, or what the last five changes to a requirement did, gets it from one osq command as a few rows instead of opening event files.

### Context

As of 2026-10-01:

- A planner today gets history from the plan prompt's "This repository's record" and "Recent executor disclosures", and otherwise opens files under `openspec/changes/archive/`. The archive holds 109 MB of event data.
- `sqlite-read-index` builds the index this command reads.
- The Notion page "SQLite read index" proposes access through osq rather than the raw database file: no `sqlite3` program needed, the layout stays free to change, and it fits ADR 006 (osq does the data work, AI the judgement).
- `PLANNER.md` and the executor protocol in `AGENTS.md` are managed blocks that `osq init` writes into consumer projects, and tests pin their text.

### Requirements

- `osq query "<select>"` runs one read-only SQL `SELECT` against a fixed set of documented views and prints the rows as a table, or as JSON with `--json`. Any statement that would write, and any table that isn't one of those views, is refused with a message that lists the views.
- The views cover changes, tasks and attempts with their outcomes and dead reasons, requirements touched per change, and executor disclosures. Their column names are documented in a living spec, and the index's base tables can change without changing them.
- The query builds or refreshes the index first, so its answer always matches the files.
- `PLANNER.md` and the executor protocol name `osq query` as the way to look up history, and say not to open event files for it.
- Output never holds verify logs, tool summaries, or absolute paths.

### Non-goals

- Network access to the index, or any server endpoint. The dashboard and the server (M3) can use the views later.
- Writing through `osq query`.
- Replacing the plan prompt's record sections.

### Verify

`pnpm verify`, plus tests:

- a select over each view returns the expected rows for a fixture archive
- an `INSERT`, `UPDATE`, `DELETE`, `ATTACH` or `PRAGMA`, and a select from a base table, are refused and exit non-zero
- `--json` and table output hold the same rows
- the managed blocks name `osq query`

### Notes for planning

- Check `node:sqlite`'s read-only open mode and authorizer support before relying on either for the refusal; a statement allowlist checked by osq is the fallback.

## [report-small-reads-once] osq report reads each task file, brief, manifest and proposal once

Depends on: nothing

### Goal

One `osq report` run reads each task file, `brief.md`, `.run/manifest.json` and `proposal.md` at most once, and prints exactly what it prints today.

### Context

As of 2026-10-01, measured while planning 133 on this repository, with 132 built and a prototype event index in place:

- A warm `osq report` takes about 2.15 s and makes about 14,000 file-system calls. About 0.67 s is idle time waiting on small reads made one after another.
- Per run: 827 reads of task files (about two per file), 532 of `brief.md` (about four per change), 456 of `manifest.json` (about three and a half), 269 of `proposal.md` (two), and 461 of done markers. `change-locations` makes about 660 `stat` calls on archive folders, and `manifest-approval` 192 on `.run/approved`.
- 132 added a read scope, `withStreamReads` in `src/core/report/stream-reads.ts`, that `getMetricsReport` opens for one call. `readParsedFile` shares one read and one parse per path and parser inside it. Event streams and `plan.jsonl` already go through it.
- Readers to look at first: `readTaskMetadata` and `projectMeasuredTasks` in `report.ts`, `readPlannerModel`, `readBriefToApprovalSeconds` in `brief-to-approval.ts`, the manifest reads in `approval-flags.ts` and `planning-slice-lookup.ts`, and `parseSpecMdFromFolder` in `src/core/spec/parser.ts`.

### Requirements

- Inside one report run, each of those files is read at most once and parsed at most once per parser. Outside a run, every reader goes to disk as today.
- `osq report` and `osq report --json` print byte-identical output.
- A test counts reads over a fixture with several archived changes and fails when any of those files is read twice.

### Non-goals

- Indexing these files in SQLite.
- Fewer `stat` or `readdir` calls, unless a reader's read moves into the scope with them.
- `status`, the inbox, the dashboard or `osq digest`.

### Notes for planning

- Measure first in a scratch worktree, as 132 did: count reads per file kind before and after, and record the report time in Background.
- Several readers live outside `src/core/report/` (`spec/parser.ts`, `run/manifest-approval.ts`, `status/change-locations.ts`). Route only those the report reaches, and check the shared parsed results are never changed by a caller.
