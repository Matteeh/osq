---
title: Regressed events name missing verify paths missingPaths
depends_on: ["067"]
verify: pnpm verify
features:
  reads:
    - watcher-and-harness
---
## Goal

An archive-time `verify_path_missing` regression records its paths in
`missingPaths`, the name the pre-spawn `verify_ran` event already uses.
`differingPaths` keeps its one meaning: files in a done task's scope that
changed after the task was done.

Change 067 task 3 wrote the missing paths into `differingPaths` on the
`regressed` event because `RegressedEventData` in `src/harness/types.ts` was
another task's scope. No archived event log in this repository contains a
`regressed` event with `verify_path_missing`, so no reader has to accept both
names and nothing is migrated. No code reads `differingPaths` from `regressed`
events today: `osq show` and the dashboard read it from `recertification`
events, and `osq retry` reads the marker body.

`writeRegressedMarker` and the marker text do not change. The only test that
asserts the old field is `tests/archive-verify-path-missing.test.ts`. The golden
event fixtures under `tests/fixtures/events/` contain no `regressed` event.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass, and a new test proves that an
archive-time `verify_path_missing` regression's event carries `missingPaths` with
the missing path and no `differingPaths`.

## Non-goals

- Rewriting any archived event.
- Changing scope-regression events, the `verify_red` archive regression, or the
  regressed marker text.

## Surface

- Changed: the `regressed` event for `verify_path_missing` carries `missingPaths` instead of `differingPaths` (event field)

## Contract

### Requirement: Archive-time verification re-run
A regression recorded because a command names a missing path SHALL list those
paths in the event's `missingPaths` and SHALL NOT carry `differingPaths`.

#### Scenario: Named path missing at archive
- **WHEN** a done task's verify names a file that no longer exists
- **THEN** its `regressed` event has reason `verify_path_missing`, `missingPaths` listing the path, and no `differingPaths`

## Human steps

- Review the proposal, delta spec, and task body, then run `osq approve 068`
  yourself.

## Delta

- `specs/watcher-and-harness/spec.md`: modifies "Archive-time verification
  re-run".

One task; no file is shared.
