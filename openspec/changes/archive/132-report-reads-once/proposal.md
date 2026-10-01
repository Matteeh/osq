---
title: osq report reads each event file once
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - traceability
    - watcher-and-harness
---
## Goal

One `osq report` run reads and parses each `.jsonl` event stream and each
`plan.jsonl` at most once, holds no verify logs in memory, and prints exactly
what it prints today. On this repository that takes the report from about
4.0 s to about 2.4 s, and from 3,593 file reads to 732, while peak memory
stays close to today's.

Today each collector the report calls opens the streams it needs by itself,
so the same file is read and parsed up to seven times in one run. After this
change, `getMetricsReport` opens a read scope for the length of one call.
Every report reader goes through it, and the scope ends when the call returns.
Nothing is kept between calls or written to disk, so `osq serve` still reads
fresh files on every `/api/report` request.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint. The existing report
tests, including the `fixture/report/expected.json` golden, prove the output
is unchanged. `tests/report-reads-once.test.ts` proves no event file is opened
twice in one report run, and that no report module parses event files by
itself.

## Non-goals

- A persistent index or cache. That is the queued `sqlite-read-index`.
- Changing what event files carry, including the full verify log in
  `verify_ran`. Only the report's in-memory copy leaves logs out.
- Making `status`, the inbox, `osq show`, the dashboard's other documents, the
  plan prompt's repository record, or `osq digest` share reads. They read few
  files or are not slow.
- Fewer directory listings. Only file reads are shared.

## Surface

None

## Decisions

None

## Contract

### Requirement: Report reads each event file once

`osq report` SHALL read and parse each event stream and each `plan.jsonl` at
most once per run, SHALL hold no verify log in memory, and SHALL print the same
output as before.

#### Scenario: Several archived changes
- **WHEN** the report runs over a project with several archived changes, each with task streams, a change stream and a planning log
- **THEN** no `.jsonl` file is opened more than once, and the report equals the one the existing tests pin

#### Scenario: Two report calls
- **WHEN** the report runs twice in one process
- **THEN** the second run reads the files again, so it reflects any change made between the runs

#### Scenario: A new report reader
- **WHEN** a module under `src/core/report/` parses event lines by itself instead of using the shared reader
- **THEN** `tests/report-reads-once.test.ts` fails and names the module

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/metrics-and-reporting/spec.md`: adds "Report event reads", "Report
  events hold no logs", and "Report reads each event file once".
- `specs/status-inspection/spec.md`: adds "Queue report shares the report's
  reads".

Two tasks, in order. Task 1 writes the read scope, `src/core/report/stream-reads.ts`.
Task 2 routes every report reader through it and reads it without changing it.
No file is shared between tasks.

The deltas describe behaviour and name no TypeScript function, so they hold
for any implementation. The task files name the functions.

## Background

**Measured on this repository on 2026-10-01**, against `main` at 131, with a
rough version of this change built in a scratch worktree:

| | Before | After |
| --- | --- | --- |
| `osq report` wall time (three runs, warm cache) | 4.0 s | 2.4 s |
| `.jsonl` reads in one run | 3,593 | 732 |
| Most reads of one file | 7 | 1 |
| Peak memory (max RSS) | ~285 MB | ~330 MB |

`osq report` and `osq report --json` printed byte-identical output before and
after. The brief's 5.8 s was a cold first run; warm runs of the old build take
4.0 s.

**Memory.** A first cut kept every file's raw text and every parsed event,
logs included, for the whole run: peak memory went to about 700 MB. 95 MB of
the archive's 108 MB of events is `verify_ran.output`, the full `pnpm verify`
log, and about 2.4 MB more is `output` on `regressed` and `recertification`.
No reader on the report path reads those fields; `parseTokenEvent`'s
`data.output` is a token count on `tokens` events. Keeping only parsed events
and dropping those three `output` fields brought peak memory to about 330 MB,
with byte-identical JSON. The logs stay in the files, and the regressed
report, `osq show`, and the dashboard's task evidence read them from disk as
today.

**Profile after the change.** Of the 2.4 s, about 0.3 s is `parseEventLines`,
about 0.15 s string decoding, and about 0.3 s file opens, stats and closes.
About 0.65 s is idle time waiting on sequential reads. `sqlite-read-index`
starts from 2.4 s.

**Where the repeated reads came from.** Each of these read event streams by
itself: `projectMeasuredTasks`, `readFirstTaskStartMs`, `readArchivedAtMs`,
`hasRejectedEvent`, `collectDeadOutcomes`, and the two stream scans in
`getMetricsReport`, all in `report.ts`; `streamPairs` in
`report-dependencies.ts`; `changeEventTrouble` in `approval-flags.ts`;
`readMeasuresTotals` in `planning-economics.ts`; `readMeasuredEvents` in
`report-mutation.ts`; `archivedEventMs` in
`src/core/status/queue-report-detail.ts`; and `readPlanRecords` in
`planning-records.ts`, which `readPlanningSessions`, `computePlanningByChange`,
`collectCostBySource` and the queue report all call.

**Why a scope and not a parameter.** Passing a reader through every collector
would change about a dozen signatures, several of them in files within a few
lines of the 250-line budget. `AsyncLocalStorage` from `node:async_hooks`
carries the scope instead, with no new dependency. A reader called outside any
scope reads from disk exactly as today, so the inbox, the watcher, `osq show`
and the web documents that share these readers are unchanged. The cost is that
the dependency is less visible, so two checks make it explicit: a test fails
when a report module parses event lines by itself, and the shared events are
frozen, so a reader that tries to change them throws.

**Measured fallout.** In the scratch worktree, with both typechecks and the
report, queue, planning, web, show and budget tests, the only failure the
change caused was `tests/function-budget.test.ts`: `getMetricsReport` becomes
a short wrapper, and the grandfathered body moves to `buildMetricsReport`, so
task 2 renames that grandfather key. `src/core/report/report-mutation.ts`
ends at 244 lines.

**Reverting.** Nothing else builds on the scope. Reverting this change restores
today's reads with no data migration, and `sqlite-read-index` may replace the
scope for archived changes.
