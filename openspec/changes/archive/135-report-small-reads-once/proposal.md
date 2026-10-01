---
title: osq report reads each task file, brief, manifest and proposal once
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
---
## Goal

One `osq report` run reads each task file, `brief.md`, `.run/manifest.json`
and `proposal.md` at most once, and prints exactly what it prints today. On
this repository that cuts those reads from 2,113 to 880 and the report from
about 2.47 s to about 2.19 s.

132 gave the report a read scope for event streams and planning logs. These
four small files still go to disk once for every reader that wants them: the
queue report scans every `brief.md` four times, three readers parse every
manifest, and both the change snapshot and the report read every task file and
proposal. After this change, those readers share one read per file through the
same scope. Outside a report run, every reader still goes to disk and fails
the way it does today.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint. The existing report
tests, including the `fixture/report/expected.json` golden, prove the output is
unchanged. `tests/report-small-reads-once.test.ts` proves that one report run
over several archived queue changes reads each of the four file kinds once.
`tests/report-shared-reads.test.ts` proves the shared reader goes to disk
outside a run and keeps read errors.

## Non-goals

- Indexing these files in SQLite.
- Fewer `stat`, `access` or `readdir` calls. `change-locations` and the
  `.run/approved` check in `readManifestApprovedAt` keep theirs.
- Done markers and the other files the report reads. Each is already read once.
- `status`, the inbox, the dashboard or `osq digest`. They call some of the
  same readers, which behave as today outside a report run.
- Sharing `parseTaskMd` results. The change snapshot needs the task file's
  text, so task files share their text and the report parses it itself.

## Surface

None

## Decisions

- ADR 008: nothing new goes into the SQLite index; the shared reads live only for one report run.
- ADR 002: unaffected; archive applies the new deltas as it applies any other.
- ADR 004: unaffected; the change does not run the OpenSpec validator.
- ADR 005: unaffected; the change does not check the validator version.

## Contract

### Requirement: Report reads each change file once

One `osq report` run SHALL read each task file, `brief.md`,
`.run/manifest.json`, and `proposal.md` at most once, and SHALL print the same
output as before.

#### Scenario: Several archived changes on a queue
- **WHEN** the report runs over a project with three archived changes, each with a proposal, a brief naming a queue item, a manifest, and a measured task
- **THEN** no task file, brief, manifest, or proposal is read more than once

#### Scenario: Read outside a report run
- **WHEN** a change folder's proposal is a directory and `osq status` runs
- **THEN** it prints `Status error: EISDIR` as before

## Human steps

### Before approval

None

### After landing

- Run `pnpm build` so the installed `osq` uses the shared reads.

## Delta

- `specs/metrics-and-reporting/spec.md`: adds "Report reads each change file once".
- `specs/spec-lint-and-approve/spec.md`: adds "Parsed proposals are shared and frozen".
- `specs/status-inspection/spec.md`: adds "Change snapshots share the report's reads".
- `specs/watcher-and-harness/spec.md`: adds "Trusted manifest approval time shares the report's reads".

Two tasks, in order. Task 1 adds the shared readers:
`readSharedFile`, `readTextFile` and `freezeDeep` in
`src/core/report/stream-reads.ts`, and the new
`src/core/report/change-reads.ts`. Task 2 routes every reader the report
reaches through them, and reads both files without changing them. No file is
shared between tasks.

## Background

**Measured on this repository on 2026-10-01**, against `main` at 134, with a
rough version of this change in a scratch worktree. Times are `osq report` run
through `tsx`, three warm runs each.

| | Before | After |
| --- | --- | --- |
| Wall time | 2.44 to 2.50 s | 2.16 to 2.21 s |
| Task file reads (475 files) | 837 | 475 |
| `brief.md` reads (135 files) | 540 | 135 |
| `manifest.json` reads (135 files) | 464 | 135 |
| `proposal.md` reads (135 files) | 272 | 135 |
| Peak memory (max RSS) | ~157 MB | ~160 to 180 MB |

`osq report` and `osq report --json` printed byte-identical output before and
after.

**Where the repeated reads came from.**

- Task files: `readChangeFolder` in `src/core/status/state.ts` (for each
  change's state) and `readTaskMetadata` in `report.ts`.
- `brief.md`: `scanQueueAssociations` in `src/core/status/queue-state.ts`,
  called four times per report by the queue report and queue planning;
  `readPlannerModel` in `report.ts` reads it on another path.
- `manifest.json`: `readBriefToApprovalSeconds`, `collectApprovalFlagOutcomes`
  in `approval-flags.ts`, and `readManifestApprovedAt` in
  `src/core/run/manifest-approval.ts`, which two report paths call.
  `resolveChangeCreationTime` in `planning-slice-lookup.ts` reads the manifest
  only during approval, so it stays as it is.
- `proposal.md`: `parseSpecMdFromFolder` in `src/core/spec/parser.ts`, from
  `readChangeFolder` and from `collectRework`.

**Why a second shared reader.** `readParsedFile` turns a read error into null.
The first cut routed `parseSpecMdFromFolder` and `readChangeFolder` through it,
and `tests/command-error.test.ts` failed: `osq status` on a proposal that is a
directory must still print `Status error: EISDIR`. `readSharedFile` shares
reads the same way but rejects with the file-system error, as `fs.readFile`
does. Readers that treated a missing file as null keep a `.catch(() => null)`.

**Shared results are frozen.** Callers inside one run get the same parsed
proposal, brief data and manifest object, so `freezeDeep` freezes them. The
proposal is frozen outside a run too, since `parseSpecMdFromFolder` always
parses through the shared reader. In the scratch worktree, with the full test
suite and both typechecks, no caller tried to change one.

**Measured fallout.** None. The only failures were `bin-execution` and
`package-hygiene`, which need a build and fail in a scratch worktree without
one. `src/core/status/state.ts` ends at about 234 lines.

**Test project.** `fixture/report` has one proposal and no queue, so it does
not reproduce these reads. A project built in the test from three archived
changes, each with a proposal, a brief naming a queue item, a manifest with
approval flags, `.run/approved`, one task with a done marker and a measured
event stream, plus a `queue.md` naming the three items, reproduces every
repeated read: today's code reads each proposal and task file twice and each
brief and manifest four times.
