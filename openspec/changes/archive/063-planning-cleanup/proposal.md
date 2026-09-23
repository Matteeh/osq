---
title: Planning cleanup
depends_on: ["062"]
verify: pnpm verify
features:
  reads:
    - watcher-and-harness
    - web-inspection
---
## Goal

Remove what change 062's workarounds left behind, and the test coupling that
forced a workaround in 061. Users see no behavior change.

Three leftovers:

- `ObservedPlanningSession` in `src/core/report/planning-observed.ts` still
  requires `usage` and `edits` and allows `startedAt` and `endedAt`. Every
  reader now returns `turns`, so the readers fill `usage` with
  `NULL_INTERACTIVE_USAGE` and rebuild `edits` from their turns only to satisfy
  the type. `sessionTurns` and `sessionEdits` in
  `src/core/report/planning-slice-turns.ts` still carry a fallback for sessions
  without turns, and `sliceChangeOwnership` in
  `src/core/report/planning-slice.ts` still takes a `sessionUsage` for it. No
  reader takes that path.
- `observePlanning` in `src/core/web/web-data-observations.ts` keeps unused
  `sessionReported` bookkeeping only so it stays over 80 lines. Without it the
  function is 76 lines, and `tests/function-budget.test.ts` fails because the
  function is still on its grandfather list.
- `tests/golden-events.test.ts` compares `measures` events with their
  `repoLines` and `repoFiles`, which count the scaffolded project, including
  `PLANNER.md`. Any edit to the managed planner block or the templates changes
  both golden fixtures, which is why 061 had to reflow planner bullets.

All three were measured in a scratch worktree against the typechecks and the
full suite. Removing the legacy fields breaks only files matching
`tests/planning-*.ts`. Removing the dead lines together with the grandfather
entry breaks nothing. Masking the two counts changes one line in each golden
fixture.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. All three tasks are
refactors whose task verify is already green before they start, so each
declares `verify_starts: green`.

## Non-goals

- The `node --test` behavior that lets a verify naming a missing test file
  pass. That gets its own brief.
- Any change to recorded planning data, report output, or dashboard output.

## Surface

None

## Contract

### Requirement: Per-turn planning readers
Each planning reader SHALL return, per native session, only its identity,
directory, model, harness version, whole-session cost, and turns. It SHALL NOT
return session-level usage, edits, or start and end times.

#### Scenario: Reader output
- **WHEN** any of the three readers parses a session with edits
- **THEN** the returned session has `turns` and no `usage`, `edits`, `startedAt`, or `endedAt` key

### Requirement: Golden event stream validation
Golden fixtures SHALL NOT depend on the scaffolded project's size.

#### Scenario: Planner block grows
- **WHEN** the managed planner block gains a line
- **THEN** both golden fixtures still match

## Human steps

- Review the proposal, delta spec, and task bodies, then run
  `osq approve 063` yourself.

## Delta

- `specs/watcher-and-harness/spec.md`: modifies "Per-turn planning readers",
  "Approval-time local planning observation", and "Golden event stream
  validation".

No file is shared between tasks.
