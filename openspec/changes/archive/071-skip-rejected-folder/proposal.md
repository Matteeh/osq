---
title: Skip the rejected folder when listing active changes
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - watcher-and-harness
    - status-inspection
---
## Goal

After the first `osq reject`, `openspec/changes/rejected/` exists and two
callers treat it as a change folder. The watcher logs `watcher error: Neither
proposal.md nor spec.md found in .../openspec/changes/rejected` on every cycle,
which is once a second in continuous mode. Bare `osq lint` reports `rejected:
proposal.md (or legacy spec.md) not found in change folder` and exits 1 on every
run. Both skip the rejected folder after this change, and the rule for which
entries of the changes directory are active change folders lives in one place
in the layout module.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests prove that one
watcher cycle beside a rejected change logs no watcher error and still runs the
approved change's task, and that bare `osq lint` beside a rejected change exits
0 without a finding that names `rejected`.

## Non-goals

- Moving `queue-state.ts`, `status.ts`, `report.ts`, `web-data-folders.ts`, or
  the doctor checks onto the new predicate. They behave correctly today, and a
  later change can consolidate them.
- Changing `osq reject`, where rejected folders live, or how `osq lint <id>`
  resolves an explicit id.
- Changing the watcher's per-folder error handling. A real change folder with no
  proposal still logs an error.
- Touching `src/core/spec/migrate.ts`, which lists the legacy layout.

## Surface

None

## Background

`runWatcherCycle` in `src/watcher/loop.ts` filters its `readdir` of the changes
directory by dropping names that start with `_` and the name `archive`.
`readChangeFolder` in `src/core/status/state.ts` then throws on `rejected`
because it holds no proposal. The per-folder `try`/`catch` logs it through
`logWatcherError` and moves on, so approved changes still run. The bug is noise,
not lost work.

`listChangeFolders` in `src/cli/lint.ts` applies the same filter, so
`lintCommand` with no ids lints `rejected` and fails.

Other listers already skip `rejected`, each in its own way: `RESERVED_DIRS` in
`src/core/status/queue-state.ts`, the folder name resolution in
`getStatusOverview` in `src/core/status/status.ts`, and the active folder filter
in `src/core/report/report.ts`. The doctor checks `checkLocks` and
`checkDoneMarkers` skip only `archive`, which is harmless because they only look
for `.run/` directly under each entry.

`src/core/status/layout.ts` holds the `archive` and `rejected` names behind
`getArchiveDir` and `getRejectedDir`. `loop.ts` and `lint.ts` already import
from it, so the fix adds no import graph edge. `layout.ts` must not import from
`state.ts`, because `state.ts` imports layout.

`createNewSpec` numbers a new change after every folder under `changes/`,
`archive/`, and `rejected/`. With `rejected/009-nope` present, the next new
change is `010`, not `001`.

Measured in a scratch worktree with a rough version of both tasks: the CLI
typecheck, lint, and every test that does not need a build pass. The
import-graph, line-budget, and function-budget tests pass. `runWatcherCycle`
shrinks from 179 to 177 lines and stays on the function budget grandfather list,
so no preexisting test changes.

## Contract

### Requirement: Active change folder entries
An entry of the changes directory SHALL be an active change folder unless its
name starts with `_` or `.`, or it is the archive or rejected folder.

#### Scenario: Watcher beside a rejected change
- **WHEN** the watcher runs a cycle and the changes directory holds `rejected` beside an approved change
- **THEN** it logs no watcher error for `rejected` and runs the approved change's task

#### Scenario: Bare lint beside a rejected change
- **WHEN** `osq lint` runs without ids and the changes directory holds `rejected` beside a valid change
- **THEN** it lints only the valid change and exits 0

## Human steps

- Review the proposal, delta specs, and task bodies, then run `osq approve 071`
  yourself.

## Delta

- `specs/cli-foundation/spec.md`: adds "Active change folder entries".

Two tasks; no file is shared. Task 2 uses the predicate task 1 adds to
`src/core/status/layout.ts`, so task 2 runs after task 1.
