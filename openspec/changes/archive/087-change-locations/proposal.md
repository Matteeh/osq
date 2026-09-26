---
title: One resolver for where changes live
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - metrics-and-reporting
    - spec-lint-and-approve
    - status-inspection
    - traceability
    - version-control
    - watcher-and-harness
    - web-inspection
---
## Goal

Every reader of running and archived changes finds them through one resolver,
and osq behaves exactly as it does today. This is the first change of stage 1
of ADR 003. Later changes in the stage teach the resolver about worktrees,
without touching the readers again. Today 19 files list or look up change
folders on their own, through three overlapping helpers and a dozen `readdir`
loops. After this change they all ask the resolver. Only the readers of drafts
and the writers that build a destination path keep using the layout helpers
directly.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. Every existing test of a
migrated reader passes unchanged. New tests prove the resolver's listing,
lookup, and location rules. A structural test proves that no file outside the
allowed list calls `getChangesDir` or `getArchiveDir`.

## Non-goals

- Worktrees, branches, or anything behind `vcs.enabled`. The resolver knows one
  tree, the project root.
- Changing any reader's output, order, or error message.
- Moving the readers of drafts, which are `new`, `lint`, `plan`, and `migrate`,
  or the archiver's destination path.
- Changing `getRejectedDir` callers that only build a destination or classify
  a path.

## Surface

None

## Decisions

- ADR 001: no config loading changes.
- ADR 002: archive is unchanged; the archiver still builds its destination
  from the layout helpers.
- ADR 004: the change adds no validator call.
- ADR 005: no version check moves.

## Background

ADR 003 decision 11: one resolver answers which changes are running or
archived but not landed, and where each one's folder is. It lands first with
today's behaviour, so stage 1 later changes one module instead of every
reader.

The resolver returns each change with the tree it lives in, and lists those
trees. With `vcs.enabled` later, a running change's tree is its worktree, and
the watcher passes that root to `runTask`. Today there is one tree, the
project root.

The call sites, grouped by task:

- Lookup helpers: `resolveSpecFolder` in `show.ts` and `listChangeFolders` in
  `web-data-folders.ts`. `findSpecFolder` in `spec/approve.ts` stays as it is,
  because `plan` and `lint` use it to find drafts.
- Lifecycle: `done.ts`, `retry.ts`, `reject.ts`, `approveSpec`, and the CLI
  approve's error path. `verification-record.ts` goes through
  `resolveSpecFolder`, so it follows task 1.
- Status: `status.ts`, `next-step.ts`, `inbox-projection.ts`, `queue-state.ts`,
  and `queue-report-detail.ts`.
- Report, doctor, and web: `report.ts`, `recent-disclosures.ts`, `doctor.ts`,
  `doctor-prices.ts`, and `web-events.ts`.
- Watcher: `loop.ts` and `baseline.ts`.

Line budgets: `doctor.ts` and `queue-state.ts` have 249 of 250 lines, and
`status.ts` 247. The migration replaces code, so those files should shrink.
`getStatusOverview` is grandfathered at 98 lines. If replacing its `readdir`
brings it to 80 or fewer, `tests/function-budget.test.ts` fails until its key
is removed, so task 3 owns that test. `retrySpec` (155 lines),
`getMetricsReport` (654), `buildSpecDetails` (278), and `runWatcherCycle`
(184) stay far over 80.

No test pins a lookup error message except through `findSpecFolder`, which
stays. `findChange` keeps `findSpecFolder`'s matching and message anyway,
because retry, done, reject, and approve report it to the human.

## Contract

### Requirement: No behaviour change
Every migrated reader SHALL produce the same output, order, and error messages
as before the change.

#### Scenario: Status unchanged
- **WHEN** `osq status` runs in a project with active, archived, and rejected changes
- **THEN** it prints what it printed before the change

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/status-inspection/spec.md`: adds "Change locations" and "Change
  location readers".

Five tasks, and no file is shared. Task 1 owns the resolver, which every later
task calls. Task 5 owns the structural test, which passes only once tasks 2 to
4 have moved their readers.
