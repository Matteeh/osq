---
title: Baseline verify before a change's first task
depends_on:
  - "085"
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - watcher-and-harness
---
## Goal

A change never starts on a tree that was already red. When
`gates.baselineVerify` is set, the watcher runs that command once, before the
first task of a change spawns. If it fails, the first task dies with
`baseline_red`, and the change halts with "tree was red before this change
started". The watcher reuses the last green baseline instead of running again
when the tree has not changed since then. Before this change, a tree broken
outside any gate was found only by an executor, which blocked or died for a
reason it could not fix, as in 084.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests with small `node`
baseline commands prove that:

- a failing baseline kills the first task with `baseline_red` before any agent
  spawns, prints "tree was red before this change started", and is not retried
  automatically
- a passing baseline records `baseline_ran` and the task runs
- after `osq retry`, the baseline runs again
- a change that has already started a task never runs the baseline
- in a git repository, a second change on an unchanged tree reuses the first
  change's green baseline, and a changed tracked or untracked file makes it run
  again
- with `gates.baselineVerify` unset, nothing runs and no event is recorded

## Non-goals

- Running verify in `osq approve`.
- Running a baseline before any task but a change's first.
- Retrying a red baseline automatically.
- Reusing a baseline outside git.
- Using the change's own `verify` as the baseline. It may be red by design
  before the change, for example when it names a test the change creates.

## Surface

- Added: `gates.baselineVerify` in `osq.config.ts` (config key)
- Added: the `baseline_ran` event (event type)
- Added: the `baseline_red` dead reason (dead reason)
- Added: the Baseline verify bullet in README.md's Gates and permissions, and `baseline_red` in its dead reasons (docs)
- Changed: osq's own `osq.config.ts` sets `gates.baselineVerify` to `pnpm verify` (config value)

## Decisions

- ADR 001: `gates.baselineVerify` loads through the existing jiti config path.
- ADR 002: archive is unchanged.
- ADR 004: the change adds no validator call.
- ADR 005: no version check moves.

## Background

The command is configured rather than fixed, because nothing in `src/` knows
about a consumer project. osq's own `osq.config.ts` sets it to `pnpm verify`.

Reuse compares HEAD and a digest of the dirty files, not HEAD alone. In
stage 0 of ADR 003, osq never commits, so a finished change leaves HEAD where
it was and its edits uncommitted. HEAD alone would reuse a green baseline over
a tree the baseline never saw. The digest leaves out every path inside a
`.run/` folder, because the watcher writes events there all the time.

Halting reuses the dead-task path. The first task dies with `baseline_red`
before its pre-spawn verify or agent spawn. So `osq status`,
`osq show`, the inbox, and `osq retry <id> <n>` all work unchanged, and the
retried attempt runs the baseline again because the change has still started
no task. `baseline_red` is not in `ELIGIBLE_AUTO_RETRY_REASONS`, so it waits for
a human.

Measured on a scratch worktree of `7a0a1b0` with a rough dead reason, event
type, optional gate key, and the repository config set: the typechecks pass and
the suite breaks in exactly one place. `tests/no-skipped-in-src.test.ts`
forbids the word "skipped" anywhere in `src/`, so a reused baseline's outcome
is `reused`. No test loads the repository's own `osq.config.ts`, and the
README tests pin the Gates and dead-reason text only by inclusion.

## Contract

### Requirement: A red tree halts before any agent spawns
When the baseline command fails, no agent SHALL spawn for the change until a
human retries its first task.

#### Scenario: Red before the change
- **WHEN** `gates.baselineVerify` exits 1 before task 1 of a change
- **THEN** task 1 is dead with `baseline_red`, no agent spawned, and the watcher printed "tree was red before this change started"

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: adds "Baseline verify configuration".
- `specs/watcher-and-harness/spec.md`: adds "Baseline verify before a change's
  first task", "Baseline reuse", and "Baseline key".

Two tasks, and no file is shared. Task 1 owns the config key and the baseline
key, which task 2's gate calls. Task 2 owns the event type, the dead reason,
the runner call, README.md, and osq's own `osq.config.ts`.
