---
queue_item: report-small-reads-once
queue_hash: sha256:7f3facc15da0b0b627d48cf22794d829dbd1949d7fb3fa3ebd5742f946a01b4c
planner: null
date: 2026-10-01
---

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
