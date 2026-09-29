---
title: The living-spec replay counts the change being archived
depends_on: []
verify: pnpm verify
features:
  reads:
    - watcher-and-harness
    - web-inspection
---
## Goal

Since 109, archive merges a change's deltas into the living specs before it
runs the change-level `verify`, while the change folder is still under
`openspec/changes/`. The living-spec replay test rebuilds each living spec from
`openspec/changes/archive/` only, so it misses the change being archived and
fails for every change that writes a delta. The replay also merges, last, each
active change whose deltas archive has applied at that moment.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. The replay test still
matches every living spec, and a new case checks which active folders the
replay picks up.

## Non-goals

- Changing when archive applies deltas or runs `verify`. "Archive-time
  verification re-run" in watcher-and-harness stays as it is.
- Changing `PRESERVED_REQUIREMENTS` or any other check in the replay test.
- Recovering 113. See Background.

## Surface

None

## Decisions

- ADR 004: unchanged; no validator call moves.
- ADR 005: unchanged; nothing here checks the validator range.

## Background

**What broke.** 113's only task passed, then its archive-time `pnpm verify`
failed on "re-seeds every living spec as the cumulative deterministic merge"
in `tests/living-specs-delta-equivalence.test.ts`. The living
`cli-foundation` spec held 113's new requirement, and the replay did not,
because 113 was not yet in the archive. 110 to 112 got past it only because
the watcher that ran them was built before 109 (`build_stamp: "eca179c"`).

**How the replay finds the change.** `applyArchiveSpecs` in
`src/watcher/archive-specs.ts` writes the record at `archiveSpecsRecordPath`
(`.run/archive-specs.json`) before it merges the deltas.
`restoreArchiveSpecs` and relocation both delete it. An active change folder
that holds the record has its deltas in the living specs right now. Any other
active folder does not.

**Measured.** A rough version ran in a scratch worktree of main on
2026-09-29. The replay test passed as it is. With 113's folder copied in,
the record written, and its delta merged, it still passed, and it failed once
the record was removed. The CLI typecheck and biome passed.

**After this lands.** The watcher syncs the default branch into a change's
worktree before it archives, so `osq retry 113 change` re-runs 113's archive
with this fix. 113 writes only cli-foundation and this change writes only
spec-lint-and-approve, so neither blocks the other's land.

## Contract

### Requirement: Replay counts the change being archived
The living-spec replay SHALL merge, after every archived delta, the deltas of
each active change folder that holds the archive record.

#### Scenario: Change being archived
- **WHEN** archive has applied an active change's deltas and runs its change-level `verify`
- **THEN** the replay test matches every living spec

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/spec-lint-and-approve/spec.md`: modifies "Living spec replay in landing order".

One task. No file is shared.
