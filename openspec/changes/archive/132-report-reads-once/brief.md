---
queue_item: report-reads-once
queue_hash: sha256:f57c0dfb1b4402d3fe79ec2cf774678018334b7cd3224e72e9c7274ce0d42faa
planner: null
date: 2026-10-01
---

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
