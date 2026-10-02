---
title: Removing a requirement never breaks the living-spec pin test
depends_on: []
verify: pnpm verify
features:
  reads:
    - watcher-and-harness
    - web-inspection
---
## Goal

A change whose delta removes or renames a pinned requirement lands without a
task that edits the pin list, and a pinned requirement lost by accident still
fails the test.

Today `PRESERVED_REQUIREMENTS` in
`tests/living-specs-delta-equivalence.test.ts` pins requirement names from the
re-seed change 028 did on 2026-09-19, and the test fails when a pinned name is
missing from a living spec. So every change that removes or renames a pinned
requirement needs a `tests.modify` task for that file. Change 112 removed
cli-foundation's "Test gating configuration" without one, and its land failed
`pnpm verify` on 2026-09-29.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint.
`tests/living-specs-pins.test.ts` proves the pin check against the real
living specs and archive, and against temporary change folders that remove,
rename, or silently lose a pinned requirement.

## Non-goals

- Dropping the pin list, or adding back names earlier changes removed from it.
- Any change to delta application, archive, or the replay check.

## Surface

None

## Decisions

- ADR 004: unaffected; the change does not run the OpenSpec validator.
- ADR 005: unaffected; the change does not check the validator version.

## Contract

### Requirement: Removed requirements leave the pin list alone

The pin check SHALL skip a pinned requirement that an archived change's delta,
or the delta of a change being archived, removes or renames away in that
capability, and SHALL still fail for a pinned requirement missing for any
other reason.

#### Scenario: Removed on purpose
- **WHEN** a change's delta lists a pinned requirement under `## REMOVED Requirements` and archive applies it
- **THEN** the pin check passes without anyone editing the pin list

#### Scenario: Lost by accident
- **WHEN** a pinned requirement is missing from its living spec and no delta removed or renamed it
- **THEN** the pin check fails naming the capability and the requirement

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/spec-lint-and-approve/spec.md`: adds "Requirement pins skip removed requirements".

One task. It moves the pin list and its check out of
`tests/living-specs-delta-equivalence.test.ts` into the new
`tests/living-specs-pins.test.ts`, which adds the skip.

## Background

**Why a new file.** The pin check passes today and must still pass afterwards
against the real repository, so a verify that runs only the existing file
would start green and prove nothing new. The new file starts red because it
does not exist yet, and its cases over temporary change folders prove the skip
and the failure. The replay test in the old file is untouched; only the
`PRESERVED_REQUIREMENTS` list and the `it` that reads it leave.

**Which deltas count.** The same folders the replay merges: every folder under
`openspec/changes/archive/`, and every active change folder holding the record
at `archiveSpecsRecordPath`, because archive applies a change's deltas before
its change-level verify runs while the folder is still active. That is the
moment 112 would have needed the skip. Order does not matter here: the skip
uses the set of names any of them removed or renamed away, read with
`parseDelta`'s `removed` and `renamed` (`from`) lists.

**History.** `osq query` lists 18 removed requirements across 10 changes and
no renames. Only 112's "Test gating configuration" was pinned, and 112's task
dropped it from the list; this change does not add it back.
