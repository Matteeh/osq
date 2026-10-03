## ADDED Requirements

### Requirement: Inbox card actions run in-process
`inboxDispatchCommand` SHALL take `isTerminal`, `input`, and `launch`
options, defaulting to both stdio streams being TTYs, the terminal input, and
`createActionLauncher` from `src/cli/inbox-actions.ts` built with the
command's `cwd`, loaded config, `stdout`, and `stderr`. When `isTerminal()`
is true and neither `json` nor `follow` is set, it SHALL run
`runCardSession` with the inbox sound built by `createInboxSound`.

`createTerminalInput(stream)` SHALL read one key at a time with raw mode on
while a key is awaited and off otherwise, and `line(question)` SHALL write
the question and read one line with raw mode off. A stream without
`setRawMode` SHALL still work. Each read SHALL resume the stream when it
starts, and when it ends remove its listeners and pause the stream, so
between reads the stream is paused, out of raw mode, and has no listener
of its own.

`createActionLauncher(inputs, actions?)` SHALL return a `Launcher` that runs
a card key's command in the same process, never through a child process,
calling the command function with `inputs` (`cwd`, `config`, `stdout`,
`stderr`):

- `approve <id>`: `approveCommand([id], inputs)`.
- `plan <id>`: `planCommand(id, inputs)`.
- `retry <id> <target>`: `retryCommand(id, target, inputs)`.
- `reject <id> --reason <text>`: `rejectCommand(id, { ...inputs, reason: text })`.
- `show <id>`: `showCommand(id, inputs)`.

It SHALL resolve 0 when the command resolves. When the command throws a
`CommandError`, it SHALL write the message and `\n` to `stderr` when the
message is not empty, then `Next: <next>\n` to `stdout` when `next` is set,
and resolve with the error's `exitCode`. Any other thrown value SHALL write
`Error: <message>\n` to `stderr` and resolve 1. Arguments that match no
entry, by verb or by count, SHALL write
`osq inbox: no action for <arguments joined by spaces>\n` to `stderr` and
resolve 1 without calling a command. The launcher SHALL never set
`process.exitCode`, end the process, or reject. `actions` SHALL default to
the table above; a test may pass its own table of the same shape.

README.md SHALL say, in the Human Attention Inbox section, that
`osq inbox` on a terminal opens cards, list the keys `a` approve, `p` plan,
`r` retry, `x` reject, `s` show, `n` skip, and `q` quit, say that a key runs
the osq command inside the same `osq inbox` process on the same terminal and
prints its error and next step when it fails, that the land command is shown
to copy, and that piping or `--json` prints as before. It SHALL not say that
a key starts a child process.

#### Scenario: Terminal runs the session
- **WHEN** `inboxDispatchCommand` runs with `isTerminal` true, scripted keys `q`, and a project with one approval item
- **THEN** the approval card with its `Keys:` block prints and the command resolves without launching

#### Scenario: No terminal prints
- **WHEN** `inboxDispatchCommand` runs with `isTerminal` false
- **THEN** it prints what `osq inbox` printed before

#### Scenario: Raw mode around a key
- **WHEN** `createTerminalInput` reads a key from a fake stream with `setRawMode`
- **THEN** raw mode is turned on before the read and off after it

#### Scenario: Show in the same process
- **WHEN** `inboxDispatchCommand` runs with `isTerminal` true, the default launcher, scripted keys `s` then `q`, and a project with one approval item for change 001
- **THEN** stdout holds `── osq show 001 ──`, then `osq show`'s `Spec: 001-` line, then `── exit 0 ──`

#### Scenario: Failed approve carries on
- **WHEN** the same session gets keys `a` then `q`, and approving change 001 fails
- **THEN** stderr starts with `Error approving 001:`, stdout holds a `Next: ` line before `── exit 1 ──` and then the approval card again, and `process.exitCode` is what it was before

#### Scenario: Each verb reaches its command
- **WHEN** the default launcher runs `retry 999 1`, `reject 999 --reason r`, and `show 999` in a project with no change 999, and `plan 001` for a change with a brief
- **THEN** stderr starts with `Error retrying 999 1:`, `Error rejecting 999:`, and `Show error:` and each resolves 1, and `plan 001` prints the prompt handoff line and resolves 0

#### Scenario: Failures without a command error
- **WHEN** a launcher built with a test table runs an action that throws `new Error('boom')`, one that throws a `CommandError` with an empty message and exit code 3, and the arguments `land 001`
- **THEN** they resolve 1 with `Error: boom\n` on stderr, 3 with nothing on stderr, and 1 with `osq inbox: no action for land 001\n` on stderr without calling any action

#### Scenario: Terminal between reads
- **WHEN** `inboxDispatchCommand` runs with `createTerminalInput` over a fake stream holding `sq` and a recording launcher
- **THEN** while the launcher runs, the stream is paused, has no `data` listener, and the last raw mode set was off

## REMOVED Requirements

### Requirement: Inbox cards on a terminal
**Reason**: A card key no longer runs its command as a child process; "Inbox card actions run in-process" replaces this requirement and keeps the rest of it.
**Migration**: None. `createChildLauncher` is removed; tests inject `launch` as before.
