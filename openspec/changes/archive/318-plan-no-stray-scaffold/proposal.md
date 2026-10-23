---
title: osq plan never leaves an empty change folder behind
depends_on: []
verify: pnpm verify
features:
  reads: [metrics-and-reporting, spec-lint-and-approve, status-inspection, version-control, watcher-and-harness]
---
## Goal

On 2026-10-23 a planner session ran `osq plan 307`, expecting change 307
to exist. It did not: `osq plan --next` had been blocked by dead tasks.
osq took `307` as the name of a new change, created
`openspec/changes/307-307/` from the template, then failed with `No
brief provided`, leaving the empty scaffold behind. It sat in `osq
status` as an unapproved change until a human asked what it was.

This change makes `osq plan <name>` read the brief before it creates
anything, so a brief that cannot be read leaves no folder. It also
refuses an all-digit name that matches no change, because a bare number
is never a new change's name.

## Verify

`pnpm verify` runs the CLI and UI typechecks, the build, every test and
lint. It proves that both refusals fail with their message and leave
the changes directory as it was, and that every other planning test,
including "Plan a finished change", still passes.

## Non-goals

- The Rust plan feature; it already refuses an unknown id.
- Cleaning up folders left by earlier runs.
- Changing what `osq plan <id>` does for a change that exists.

## Surface

- Added: the plan refusal `osq plan <number> names no change, and a number is not a name for a new change. Plan the next queue item with osq plan --next, or start a change with osq plan <name> --brief <file> and a descriptive name.`
- Changed: `osq plan <name>` with a brief it cannot read fails before it creates the change folder.

## Decisions

- ADR 001: no change to config loading.
- ADR 004: no change to the OpenSpec validator.
- ADR 005: no change to the validator peer range.
- ADR 010: the validator is untouched.
- ADR 012: the watch service is untouched.
- ADR 015: `osq mcp` gains no tool; its plan tools stay as they are.
- ADR 018: the steering planner is untouched; a change that needs steering is found before either refusal runs.
- ADR 019: `osq plan --run` is untouched.
- ADR 021: autopilot plans through `--next`, which neither refusal touches.

## Assumptions

- The new test uses `node:test` directly, not `scenario()`: the living cli-foundation spec holds repeated scenario names, so `lookupScenario` refuses every cli-foundation lookup, as 313 found.
- The number refusal checks every change location, active, archived and rejected, so an archived number still gets the finished-change message it gets today.

## Contract

### Requirement: Plan refuses before writing

See `specs/cli-foundation/spec.md`, with the scenarios "Plan with a
brief it cannot read" and "Plan a number that names no change".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: ADDED "Plan refuses before writing".
