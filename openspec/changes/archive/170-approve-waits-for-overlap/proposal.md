---
title: Approve stacks on an unlanded change that writes the same capability
depends_on: []
verify: pnpm verify
features:
  reads: [version-control, cli-foundation, metrics-and-reporting, traceability]
---
## Goal

Approve stacks a change only on the `depends_on` entries that are approved or
archived. A change that only shares a capability with another unlanded
change is cut from the default branch next to it, and the two meet at sync:
150 halted with `sync_conflict` against 149, and 161 to 163 restarted from
main, about $3 of the queue's $5.82. The habit "land before the next
approve" lives in notes, not in osq.

With this change, approve also stacks on every approved or archived, unlanded
change that writes a capability this change writes, as if `depends_on` named
it. It records each one in `.run/stacked-on` as an overlap line, so the cut,
sync, squash message and land-order check treat it like a declared
dependency. The run stays unattended. The human still lands, but no longer
has to land first. `osq approve`, `osq show` and the change view say which
change this one runs after and why.

An overlap is softer than a declared dependency. When the overlapped change
is rejected or approved again, the overlap line drops instead of halting,
because the conflict it guarded against is gone. When two overlapped changes
archived on separate branches, the change waits until they land instead of
halting with `dependency_diverged`.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test (the new approve, cut, show and
change-view tests, plus the land, sync and stacked tests that pin today's
behavior), and lint, on the final tree.

## Non-goals

- Overlap by code file alone. Capability overlap is what conflicts at sync,
  because living specs are rebuilt per capability.
- Running two overlapping changes in parallel.
- An opt-out flag. Stacking on overlap is the behavior, not a setting.
- Approval without `vcs.enabled` or under `NoVcs`, which has no worktrees to
  stack.
- A new approve notice. The wait shows as its own line.

## Surface

- Added: overlap lines in `.run/stacked-on`, `<folder> <hash> overlap <capabilities>` (marker file format)
- Added: `  Runs after <folder>, which also writes <capabilities>` line in `osq approve` output
- Added: `Runs after:` line in `osq show`, and `runsAfter` in `osq show --json`
- Added: `Runs after` row in the dashboard change view

## Decisions

- ADR 002: unchanged; living specs still merge only at archive, and stacking does not touch them.
- ADR 004: unchanged; no validator call is touched.
- ADR 005: unchanged; no validator call is touched.
- ADR 010: unchanged; the validator still runs once at archive on the stacked change.
- ADR 012: the watch service still cuts stacked changes in its cycle; an overlap wait is one more reason to wait, never a halt that needs a restart.
- ADR 013: the change view only reads the new field; no write path changes.

## Assumptions

- Changes approved before this lands keep their old cuts. Two such changes that share a capability still meet the land-order check, `assertNoEarlierChange`, which stays as it is.
- Four land and sync test files build two changes cut side by side that share a capability. Task 1 makes their approve helpers drop overlap lines from the stacked copy, which is a no-op until task 2 adds overlap lines, so those tests keep testing the side-by-side case.
- A change halted or dead in its worktree still reads `approved`, so a change overlapping it waits until it archives and lands, or is rejected.

## Contract

The spec-lint-and-approve, watcher-and-harness, status-inspection and
web-inspection deltas below are the contract.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/spec-lint-and-approve/spec.md`: ADDED "Capability overlap", "Awaited dependencies"; MODIFIED "Stacked approval".
- `specs/watcher-and-harness/spec.md`: MODIFIED "Stacked cut".
- `specs/status-inspection/spec.md`: ADDED "Runs after in show".
- `specs/web-inspection/spec.md`: ADDED "Runs after in the change view".

Each file belongs to one task. Tasks 3 to 5 read `src/core/spec/stack-overlap.ts`
and `src/core/spec/stack-dependencies.ts`, which task 2 owns, without editing
them.
