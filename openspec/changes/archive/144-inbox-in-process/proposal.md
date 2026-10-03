---
title: The inbox card session runs actions in its own process
depends_on: ["142"]
verify: pnpm verify
features:
  reads: [status-inspection, spec-lint-and-approve, web-inspection]
---
## Goal

A key on an `osq inbox` card runs its command inside the `osq inbox` process
instead of starting a second osq. The card session already has the loaded
config and its writers, so a key no longer pays a Node start and a config
load, and the reviewer sees the command's own error message and next step
when it fails, not only `── exit 1 ──`. The terminal stays usable after any
action. This is step 3 of the follow-up to 111, and the call path M2's browser
actions will use.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new
`tests/inbox-in-process.test.ts` drives `inboxDispatchCommand` on a scripted
terminal with the default launcher: `s` prints `osq show` in the same process,
and a failing `a` prints the approve error and its `Next:` line, then the card
again, with `process.exitCode` untouched. It also checks each card verb reaches
its real command, the launcher's handling of every failure kind, and that
while an action runs the terminal stream is paused, has no data listener, and
is out of raw mode.

## Non-goals

- Web write actions. This builds the call path they will use.
- Changing which keys a card shows, or the `── <label> ──` and `── exit <code> ──` lines around an action.
- Interrupting a running action with Ctrl-C. Every keyed action finishes on its own.
- Changing what any command prints.

## Surface

- Changed: a key in the `osq inbox` card session runs its command in the same process; on failure it prints the command's error and, when there is one, its `Next:` line before `── exit <code> ──`.
- Added: `osq inbox: no action for <arguments>` (error line printed when a key's arguments match no in-process action).

## Decisions

- ADR 001: unaffected; the card session uses the config `osq inbox` already loaded, and loads no other.
- ADR 004: unaffected; an in-process `approve` runs the validator exactly as `osq approve` does.
- ADR 005: unaffected; the validator range check is the same in-process.

## Contract

### Requirement: Inbox card actions run in-process

The card session SHALL run each key's command by calling its command function
in the `osq inbox` process with the session's `cwd`, config, `stdout` and
`stderr`, and SHALL NOT start a child process for it. A failed action SHALL
print its `CommandError` message and `Next:` line as `runCli` does, the session
SHALL carry on, and `process.exitCode` SHALL be unchanged. Between key reads
the terminal stream SHALL be paused, out of raw mode, and without the
session's listeners, so an action that reads stdin or hands the terminal to a
child finds it as the shell leaves it.

#### Scenario: Show in the same process
- **WHEN** the card session's `s` key runs on an approval card with the default launcher
- **THEN** `osq show`'s text prints between `── osq show 001 ──` and `── exit 0 ──`

#### Scenario: Failed approve carries on
- **WHEN** the `a` key's approve fails
- **THEN** stderr holds `Error approving 001:`, stdout holds `Next: ` and `── exit 1 ──`, the same card shows again, and `process.exitCode` is unchanged

#### Scenario: Terminal between reads
- **WHEN** a launcher runs after a key read from `createTerminalInput`
- **THEN** the stream is paused, has no `data` listener, and raw mode was last set off

## Human steps

### Before approval

None

### After landing

- Run `pnpm build` in this checkout, because the globally linked `osq` runs `dist/`.

## Delta

- `specs/cli-foundation/spec.md`: removes "Inbox cards on a terminal" and adds "Inbox card actions run in-process", which keeps everything the removed requirement said except the child launcher.

One task, which owns every file it touches.

## Background

**Why `createChildLauncher` goes.** Every keyed verb (`approve`, `plan`,
`retry`, `reject`, `show`; `cardKeys` in `src/core/status/dispatch-keys.ts`)
now has a command function that takes the command inputs (change 142), and
none of the five arguments a card passes needs a separate process. A fallback
would keep a second path that shows only an exit code, needs its own SIGINT
handling, and has to locate osq's `bin` entry under tsx and the build. Tests
keep the seam through the `launch` option, which stays.

**What reads the terminal.** No card passes `--confirm` or `--session`, so
today `approve` never asks and `plan <id>` only writes the prompt handoff.
`plan` can still start `$EDITOR` with inherited stdio when a change has no
brief, and `approve --confirm` reads through `node:readline`, whose `close()`
pauses stdin. `createTerminalInput` used to leave the stream flowing between
reads, which would race any child that inherits the terminal, and a stream a
readline had paused would never resume, since adding a `data` listener does
not resume an explicitly paused stream. It now resumes the stream when a read
starts and pauses it when the read ends.

**What a web caller would pass.** `createActionLauncher` takes
`{ cwd, config, stdout, stderr }`. A browser action would pass the server's
project root and config and writers that collect the text for its response.

**Measured on 2026-10-03** by applying the change in a scratch worktree and
running the CLI typecheck and the whole `tests/**/*.test.ts` suite. Only
`tests/inbox-cards.test.ts` changes: it imports `createChildLauncher` and has
a `createChildLauncher` describe block that spawns real children. Its
`createTerminalInput` tests pass unchanged with the pause. `tests/dispatch-session.test.ts`,
`tests/wait-recording.test.ts`, `tests/inbox-wait-log.test.ts`, and
`tests/command-inputs-inbox.test.ts` inject their own `launch` and stay frozen.
The new `src/cli/inbox-actions.ts` exports no `*Command` function, so the
command table in `tests/cli-no-direct-output.test.ts` needs no entry. No test
pins the README's inbox paragraph.
