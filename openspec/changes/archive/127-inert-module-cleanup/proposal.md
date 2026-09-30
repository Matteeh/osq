---
title: The inert modules left by removed commands are deleted
depends_on: [125]
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - status-inspection
    - spec-lint-and-approve
---
## Goal

No `export {};` stand-in is left in `src/` or `tests/` for a module a change
removed. 123 left five, because the watcher's git guard reported every deleted
scoped file as a `scope_violation`. 126 fixed the guard. 125 leaves
`VerificationRequirement` in `src/core/spec/human-steps.ts` with nothing using
it. This change deletes all of them, and a new test keeps inert stand-ins from
coming back.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. A new test finds no file
under `src/` or `tests/` whose only code is `export {};`, and no
`VerificationRequirement` in `src/core/spec/human-steps.ts`.

## Non-goals

- Any behaviour change. Nothing imports the deleted modules, and
  `tests/done-removed.test.ts` keeps proving that `osq done` is gone.

## Surface

None

## Decisions

- ADR 001: unchanged; no config loading moves.
- ADR 004: unchanged; no validator call moves.
- ADR 005: unchanged; no validator call moves.

## Background

**The files.** `src/cli/done.ts`, `src/core/lifecycle/done.ts`,
`src/core/status/leftover-drafts.ts`, `tests/done-manual.test.ts`, and
`tests/status-leftover.test.ts` each hold a comment and `export {};`. The only
reader is the "leaves no exported done command in the command sources" case
in `tests/done-removed.test.ts`, which imports the two done modules. Once they
are deleted, that case has nothing to check. The case that runs
`osq done 001 1 --manual` still proves the command is gone.

**Why after 125.** Until 125's task 5 deletes `src/core/status/verification.ts`,
and its task 2 changes `src/watcher/archiver.ts`, both import
`VerificationRequirement`. So this change depends on 125.

**Measured fallout.** On 2026-10-01 the five files were deleted and the case
removed in a scratch worktree, then run through the CLI typecheck, lint, and
the full suite: 2854 passed and none failed. The type's removal could not be
measured before 125 lands. After 125, nothing imports it.

## Contract

### Requirement: No inert stand-ins
No file under `src/` or `tests/` SHALL consist only of comments and
`export {};`.

#### Scenario: Removed module
- **WHEN** a change removes a module
- **THEN** it deletes the file instead of leaving an `export {};` stand-in

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: adds "No inert stand-ins". No living requirement names the deleted files or the type, so watcher-and-harness, status-inspection, and spec-lint-and-approve, which own three of them, get no delta.

One task.
