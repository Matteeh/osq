---
title: Whether a capability is opted into traceability is answered in one place
depends_on: []
verify: pnpm verify
features:
  reads:
    - traceability
    - watcher-and-harness
    - metrics-and-reporting
    - spec-lint-and-approve
    - status-inspection
---
## Goal

Four files each carry their own copy of "is this capability opted into
traceability" or "is anything opted in". `config-traceability.ts`, which
defines the setting, exports one function for each question, and the four
files call them.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. The existing tests of the
mutation pick, focused tests, mutation check, and mutation report pass
unchanged, so behaviour for `'all'`, a list, and `[]` is the same. A new test
checks both functions and that no consumer keeps its own copy.

## Non-goals

- Merging the two `'all'` expanders, `readOptedIn` in
  `src/core/spec/traceability-lint.ts` and `optedInCapabilities` in
  `src/core/report/report-traceability.ts`. They differ on purpose.
- `traceabilityScope` in `src/core/foundation/traceability-block.ts`, which
  formats the opted-in names for the instruction blocks rather than answering
  yes or no.
- Changing the traceability config's shape or its validation.

## Surface

None

## Decisions

- ADR 001: unchanged; config loading and `validateTraceabilityConfig` stay as they are.
- ADR 004: unchanged; no validator call moves.
- ADR 005: unchanged; nothing here checks the validator range.

## Background

**Where the copies are.** A private `isOptedIn` sits in
`src/core/trace/mutation-pick.ts`, `src/core/run/focused-tests.ts`, and
`src/core/report/report-mutation.ts`; the last takes the bare `capabilities`
value. A private `hasOptedInCapability` sits in
`src/watcher/mutation-check.ts`, and `collectMutationScores` in
`report-mutation.ts` repeats it inline. The brief calls that function
`getMutationScores`; it is `collectMutationScores`.

**Why a delta.** The brief says the change writes none, but `osq lint` rejects
a change without one. The functions live in cli-foundation's code, so its
delta adds "Traceability opt-in check". The four consumers belong to
traceability, watcher-and-harness, and metrics-and-reporting, and `osq lint`
warns that those have no delta. No behaviour they specify changes, so they
stay reads, and cli-foundation's requirement names every consumer.

**Measured fallout.** A rough version ran in a scratch copy of main on
2026-09-29: both typechecks, the build, lint, and every test passed, the line
and function budgets included. The only failures were three tests that need a
git checkout, which the copy was not. No existing test changes, so the task
doesn't set `tests.modify`. No grandfathered function shrinks: the removed
helpers were separate functions.

## Contract

### Requirement: One opt-in definition
Whether a capability is opted into traceability SHALL have one definition,
and every consumer SHALL call it.

#### Scenario: Nothing opted in
- **WHEN** `traceability.capabilities` is `[]`
- **THEN** no capability is opted in, and the watcher's mutation check and the report's mutation scores do nothing

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: adds "Traceability opt-in check".

One task. No file is shared.
