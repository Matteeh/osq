---
title: One ADR says when osq may run an approved queue without a human
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - status-inspection
    - version-control
---
## Goal

Today a human taps approve and land for every queue item, even when the whole
queue was shaped in one planner session. The next target, a fresh repository
rebuilt from an exported queue, should build from the first item to the last
with nobody watching. ADR 006, ADR 018 and ADR 003 stand in the way: they
reject headless planning for new changes, have a human approve every steering
revision, and write the default branch only through a command the human runs.

This change adds ADR 021, Autopilot, and nothing else. Its rule: with
autopilot on, a human approves the queue once; osq plans, approves, runs and
lands each approved item in order, and stops when recovery runs out. It
decides that autopilot is off by default and set per project; that
`osq queue approve` is the human gate, sealed by a hash of every item so an
edited item does not run; that autopilot plans with ADR 019's planner,
approves through `osq approve` and lands through `osq land`, and never skips
or overrides a gate; and the recovery ladder of automatic retries, then up to
`autopilot.maxSteers` steering rounds with ADR 018's planner, then a full
stop. It records how it amends ADR 003, ADR 006 and ADR 018.

`autopilot-queue-run` and `autopilot-recovery` build what it decides.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test and lint on the final tree,
including the new `tests/autopilot-adr.test.ts` and `osq doctor`'s
own-decision tests, which fail when an accepted ADR names a check file that
does not exist.

## Non-goals

- Building any part of autopilot: the `autopilot` config block,
  `osq queue approve`, the approval record, the watcher loop or recovery.
- Parallel changes. Autopilot runs one change at a time.
- Changing the text of ADR 003, ADR 006, ADR 018 or ADR 019. ADR 021 records
  how it amends them, as ADR 018 and ADR 019 did for theirs.
- Changing AGENTS.md's project rules block. ADR 021 does not apply to all.
- Notifications beyond the inbox.

## Surface

- Added: ADR 021, `decisions/021-autopilot.md` (document)
- Added: `tests/autopilot-adr.test.ts` (the ADR's check file)

The ADR names `autopilot.enabled`, `autopilot.maxSteers` and
`osq queue approve`; the changes that build autopilot add them.

## Decisions

- ADR 002: archive and delta application are not touched.
- ADR 010: the validator keeps running under autopilot and never stops a change.
- ADR 012: not touched; autopilot relies on the watcher restarting after a land rebuilds osq.
- ADR 018: amended by the new decision for autopilot only; its own text does not change.
- ADR 019: reused as autopilot's planner; its text does not change.

Task 1 adds the autopilot decision, `decisions/021-autopilot.md`, which
governs every later change that writes watcher-and-harness, cli-foundation,
status-inspection or version-control.

## Assumptions

- ADR 003's rule, which applies to all and sits in AGENTS.md, keeps its text. ADR 021 reads `osq queue approve` as the human command under which autopilot lands each item. The alternative is to change ADR 003's rule, which would change the rules block in AGENTS.md and CLAUDE.md.
- Under autopilot the steering planner runs as if `autoSteer.enabled` were on, so a project does not need both switches.
- Measured on 2026-10-16 in a scratch worktree with ADR 021 and its README line: all 365 tests in the 45 test files that read osq's decisions passed unchanged, along with the UI docs tests, `tests/doctor.test.ts` and `tests/line-budget.test.ts`, and `osq doctor` reported 21 ADRs valid.

## Contract

The watcher-and-harness delta below is the contract.

## Human steps

### Before approval

None

### After landing

- Update the Notion roadmap: ADR 021 decides autopilot, and `autopilot-queue-run` is next.

## Delta

- `specs/watcher-and-harness/spec.md`: ADDED "Autopilot decision" (task 1).

No file is shared between tasks.
