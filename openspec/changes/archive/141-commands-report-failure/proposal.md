---
title: Every command reports failure the same way
depends_on: []
verify: pnpm verify
features:
  reads: []
---
## Goal

Every osq command reports failure by throwing a `CommandError`, and no file in
`src/cli/` other than `run.ts` sets `process.exitCode`. The injectable `exit`
option on `land`, `message`, `sync`, `graph`, `lint`, `doctor` and `migrate`
goes, because a thrown error replaces it. Each command's stdout, stderr and
exit code stay byte-identical.

Change 111 moved the commands that called `process.exit` to `CommandError`. A
second group never called `process.exit` and still sets `process.exitCode`
itself, a global: an in-process caller carries on after them but cannot tell
which call failed or why. This is step 1 of three; see Background.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint. Each task's new test
calls its commands directly and through `runCli` with `tests/cli-capture.ts`,
proving the thrown `CommandError` and byte-identical output.
`tests/cli-no-exit-code.test.ts` proves no file in `src/cli/` other than
`run.ts` sets `process.exitCode` or declares an `exit` option.

## Non-goals

- Giving commands their working directory, config and writers as arguments
  in one convention. That is the queue item `command-inputs`, after this one.
- Running inbox card actions in-process. That is the queue item
  `inbox-in-process`, after `command-inputs`.
- `process.exit` or `process.exitCode` outside `src/cli/`: the watcher's
  signal and preflight exits, and the harness adapters.
- Returning a result from a command that fails. `lintCommand`,
  `doctorCommand` and `migrateCommand` still return their result on success;
  on failure they throw after printing, and no caller in `src/` reads a failed
  result.

## Surface

- Removed: the `exit` option of `landCommand`, `messageCommand`, `syncCommand`, `graphCommand`, `lintCommand`, `doctorCommand` and `migrateCommand` (programmatic API, not a CLI flag).

## Decisions

- ADR 001: unaffected; configuration still loads through jiti.
- ADR 004: unaffected; `osq lint` runs the validator as before.
- ADR 005: unaffected; the validator range check is unchanged.

## Contract

### Requirement: Failing commands throw

A command that fails SHALL throw a `CommandError` carrying its exit code, and
SHALL print exactly the text, on exactly the streams, that it printed before.

#### Scenario: Land refusal through the CLI
- **WHEN** `osq land 999` runs with no archived change 999
- **THEN** stderr holds the same refusal line as before, stdout is empty, the exit code is 1, and `landCommand` called directly rejects with a `CommandError` with that message

#### Scenario: Lint finding
- **WHEN** `osq lint <id>` runs on a change with an error finding
- **THEN** the findings print as before, the exit code is 1, and `lintCommand` called directly rejects with a `CommandError` with an empty message and exit code 1

#### Scenario: Planner exit code
- **WHEN** an interactive planner session that `osq plan` launched exits 3
- **THEN** `osq plan` prints nothing more and exits 3

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: modifies "Command errors".

Six tasks, in order: lint, doctor, land and message, sync and graph and
migrate, plan and serve, then the inbox and the guard test. Each task converts
its commands and every test the conversion breaks, so `pnpm verify` stays
green after each one.

Two test files are shared, because each calls two commands that convert in
different tasks:

- `tests/impact-lint.test.ts`: task 1 updates its `lintCommand` calls, task 2
  its `doctorCommand` calls.
- `tests/steering-plan-default-branch.test.ts`: task 1 updates its
  `lintCommand` calls, task 3 its `landCommand` calls.

The watcher recertifies task 1 by itself when tasks 2 and 3 change them,
because task 1's verify does not read them.

## Background

**The split.** The queue item asked for three steps: throw `CommandError`
everywhere, give every command its inputs as arguments, and run inbox actions
in-process. Measured on 2026-10-02, step 1 alone breaks 36 test files, and
step 2 changes the writer convention that about 48 test files capture
through. The human chose on 2026-10-02 to make each step its own change, so
this change is step 1, and the queue gets `command-inputs` and
`inbox-in-process` after it.

**Where the commands set the exit code today.**

| File | How |
|---|---|
| `land.ts`, `message.ts`, `sync.ts`, `graph.ts` | `exit` option, defaulting to `process.exitCode = code` |
| `lint.ts`, `doctor.ts`, `migrate.ts` | the same `exit` option |
| `index.ts` | the `plan` and `serve` actions catch any error, print `Error: <message>`, set `process.exitCode = 1` |
| `plan-queue.ts` | `prepareQueueSelection` prints a refusal and sets `process.exitCode = 1` |
| `plan.ts` | passes a non-zero planner exit code through `process.exitCode` |
| `inbox-dispatch.ts` | `--follow` with `--json` prints a refusal and sets `process.exitCode = 1` |

`plan.ts`'s planner exit code was not in the Notion analysis; a grep found it.

**The message rule, from 111.** Where a command printed a plain line to
stderr and then failed, it throws a `CommandError` whose message is that line
without its trailing newline; `runCli` prints it with `console.error`, which
gives the same bytes. Where a command prints its failure through the logger
or as a report (lint findings, doctor's check lines, migrate's logger lines,
land's result lines, a planner's own output), it keeps printing as today and
throws a `CommandError` with an empty message and the exit code; `runCli`
prints nothing for an empty message.

**`plan` and `serve` wrappers.** They print every error as `Error: <message>`.
After this change `planCommand` throws `CommandError`s of its own (the queue
refusal and the planner exit code), which never had that prefix. So the
wrappers rethrow a `CommandError` unchanged and turn any other error into
`CommandError('Error: <message>')`.

**Measured fallout.** In a scratch worktree with the whole conversion,
`pnpm test` failed in 25 test files and the CLI typecheck, which covers
`tests/`, flagged 11 more that pass `exit:` in success paths. All 36 are in
the tasks' scopes, grouped by the command they call; the tests that failed
only for lack of a build (`bin-execution`, `package-*`, `web-export`) are not
fallout. `tests/watcher-dev.test.ts` and `tests/watcher-stale-every-pass.test.ts`
pass `exit` to the watcher, not to a command, and are unaffected.

**Line budgets.** `src/cli/plan-queue.ts` is at 249 lines and `index.ts` at
242; both conversions replace lines rather than add them.
