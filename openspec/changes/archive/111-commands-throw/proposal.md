---
title: osq's commands throw a CommandError instead of ending the process
depends_on: []
verify: pnpm verify
features:
  reads:
    - metrics-and-reporting
    - spec-lint-and-approve
    - status-inspection
    - watcher-and-harness
---
## Goal

Every command under `src/cli/` that ends the process with `process.exit`
throws a `CommandError` instead, carrying the message it printed and its exit
code. `runCli` prints that message, and the approve refusal's next step, and
sets `process.exitCode`, in one place. A caller can then run a command, read
why it failed, and carry on: the inbox now, and web actions later. A person at
a terminal sees the same text, on the same streams, in the same order, with
the same exit codes.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. Each converted command is
tested through `runCli`, the real entry point, for its stderr, stdout, order,
and exit code, and one test fails if any file under `src/cli/` calls
`process.exit` again.

## Non-goals

- Running inbox actions in the same process. That follows once each command
  takes its config, working directory, and output streams as arguments.
- Changing any command's output, output stream, or exit code.
- Commands that already set `process.exitCode` without ending the process:
  `land`, `message`, `sync`, `graph`, `lint`, `doctor`, `migrate`, `plan`,
  `serve`, `osq inbox`, and the queue path of `plan`. A caller can already
  carry on after them. Moving them to `CommandError` belongs with the
  in-process inbox change, which needs their output injectable anyway.
- `process.exit` outside `src/cli/`: the watcher's SIGINT and preflight exits
  and the harness adapters' fatal exits end long-running processes on purpose,
  and belong to watcher-and-harness.
- Exporting `CommandError` from the package's public entry, `src/index.ts`.

## Surface

None

## Decisions

- ADR 001: commands still load `osq.config.ts` through `loadConfig`, and a `ConfigLoadError` still reaches `runCli` unchanged.
- ADR 004: unchanged; no validator call moves, and a validator refusal during approval is still an `Error approving <id>:` message with exit code 1.
- ADR 005: unchanged; a validator outside the peer range still fails approval the same way.

## Background

**Measured fallout.** A rough version of all four tasks ran the full suite
and both typechecks in a scratch worktree. Eleven tests failed, all in the
four files that stub `process.exit` around a command:
`tests/approve-confirm.test.ts`, `tests/plan-approve-next-step.test.ts`,
`tests/verification-record.test.ts`, and `tests/cli-config-errors.test.ts`.
Changing only their capture helpers, so they catch the `CommandError` and read
its exit code, message, and next step, made all 32 of their tests pass with
every assertion unchanged. `tests/opencode-v2.test.ts`,
`tests/watcher-preflight.test.ts`, `tests/watcher-loop-logging.test.ts`, and
`tests/codex/watcher.test.ts` stub `process.exit` for the watcher and
harnesses, which this change leaves alone. The line and function budgets
still pass.

**The next step travels with the error.** `osq approve` prints its error to
stderr and then `Next: <step>` to stdout. If the command printed the next
step and threw, `runCli` would print the error after it, reversing the order
the "Approve refusal next step" requirement fixes. So `CommandError` carries
an optional `next`, and `runCli` prints it after the message. A caller such as
an inbox card gets both why the command failed and what to do next.

**A failed check has no message.** `osq check` prints the check's exit code,
output, and next step to stdout and exits 1 with nothing on stderr. It throws
a `CommandError` with an empty message, and `runCli` prints nothing for an
empty message.

**`runCli` never ends the process.** `bin.ts` is the entry point, and it only
awaits `runCli`. `runCli` also answered a `ConfigLoadError` with
`process.exit(1)`, which would still end any caller. It sets
`process.exitCode = 1` instead, as it does for a `CommandError`. None of the
converted commands leaves a timer, server, or child process running after it
fails, so Node exits as soon as `runCli` returns.

**Multi-id approve.** `osq approve A B` stopped at the first failure only
because the process ended. The thrown error leaves the loop at the same
point, so B is still not approved. A refusal thrown from the `--confirm`
review callback passes through `approveSpec` uncaught, and `approveCommand`
rethrows any `CommandError` unchanged instead of wrapping it in
`Error approving <id>:`.

**Messages keep their prefixes.** Each `CommandError` message is the exact
text the command passed to `console.error`, prefix included: `Show error: `,
`Error rejecting <id>:\n  `, and so on. `runCli` prints it as it is, whereas a
`ConfigLoadError` keeps its `Error: ` prefix from `runCli`.

## Contract

### Requirement: Commands report failure by throwing
A command under `src/cli/` SHALL report failure by throwing a `CommandError`,
and `runCli` SHALL print it and set the exit code without ending the process.

#### Scenario: Caller carries on
- **WHEN** a caller awaits `showCommand('999')` in a project without change 999
- **THEN** it rejects with a `CommandError` whose message is `Show error: Spec "999" not found in specs or archive` and whose exit code is 1, and the caller keeps running

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: adds "Command errors" and "Command error output"; modifies "Config error exit" and "Approve refusal next step".

Four tasks. Task 1 adds `CommandError`, the `runCli` branch, and the shared
test helper `tests/cli-capture.ts`, and converts `status`, `show`, and
`report`. Task 2 converts `new`, `done`, `reject`, `retry`, `queue`, and the
root inbox. Task 3 converts `check` and `verified`. Task 4 converts `approve`
and adds the test that no file under `src/cli/` calls `process.exit`.

No file is shared between tasks. Tasks 2 to 4 import
`src/cli/command-error.ts` and `tests/cli-capture.ts` from task 1 without
changing them.
