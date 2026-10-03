---
title: Every command takes its inputs as arguments
depends_on: ["141"]
verify: pnpm verify
features:
  reads: [status-inspection, metrics-and-reporting, spec-lint-and-approve, version-control, watcher-and-harness, web-inspection]
---
## Goal

Every osq command function accepts `cwd`, `config`, `stdout` and `stderr`
with the same names and meaning, and prints only through those writers, which
receive exact text, newlines included. Code that is not the terminal, such as
the inbox running a card action in-process or a browser action in the M2
dashboard, can then run any command and capture exactly what it prints. This
is step 2 of three; see Background.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint. Each task's new test
calls its commands directly with the four inputs and through `runCli`, and
proves the captured stdout and stderr text is the same both ways.
`tests/cli-no-direct-output.test.ts` proves no file in `src/cli/` other than
`command-inputs.ts` calls `console.*`, `process.stdout.write` or
`process.stderr.write`, and its typed table proves every command accepts
`CommandInputs`.

## Non-goals

- Running inbox card actions in-process; that is the queue item
  `inbox-in-process`. The card launcher still spawns osq's own bin.
- Changing what any command prints, on which stream, or its exit code.
- Interactive input. How each prompt reads today is recorded under
  Background for `inbox-in-process`; none of it changes.
- Output that does not come from a command function: the watcher loop's own
  writes (the stale-build exit line and the cursor reset), the `--dev`
  supervisor, the harness adapters, and core seams whose default writers stay
  as they are because every command now passes its own.
- Routing `runCli` itself through injected writers. `runCli` prints a
  `CommandError` with the process defaults from `command-inputs.ts`; an
  in-process caller calls the command function and catches the error.

## Surface

- Added: `CommandInputs`, `Writer`, `resolveInputs`, `commandLogger`, `processStdout` and `processStderr` in `src/cli/command-inputs.ts` (programmatic API, not a CLI flag).
- Changed: the `stdout` option of `statusCommand`, `queueCommand`, `showCommand`, `inboxCommand`, `inboxDispatchCommand`, `reportCommand`, `queryCommand`, `digestCommand`, `doctorCommand` and `serveCommand` now receives exact text with its trailing newline (programmatic API).
- Added: `cwd`, `config`, `stdout` and `stderr` options on every command function that lacked one of them, including `setupCommand`, `watchCommand`, `initCommand` and `planCommand` (programmatic API).
- Changed: `requestApproval`'s `print` option is required (programmatic API).

## Decisions

- ADR 001: unaffected; a command given no `config` still loads it through `loadConfig` and jiti.
- ADR 004: unaffected; `osq lint` runs the validator as before.
- ADR 005: unaffected; the validator range check is unchanged.

## Contract

### Requirement: Command inputs

Every command function SHALL accept `cwd`, `config`, `stdout` and `stderr`.
A writer SHALL receive exactly the text the command prints, newlines
included, and a command given none of them SHALL behave as before.

#### Scenario: Captured in-process
- **WHEN** a caller awaits `statusCommand({ cwd, config, stdout, stderr })`
- **THEN** `stdout` receives the same text `osq status` prints in `cwd`, ending in a newline, and nothing reaches the process streams

#### Scenario: Defaults
- **WHEN** `osq status` runs in a project
- **THEN** stdout, stderr and the exit code are the same bytes as before this change

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: adds "Command inputs" and "Commands print
  through their inputs"; modifies "Land
  command" and "Sync command", whose text named the `exit` option that 141
  removed.

Twelve tasks. Task 1 adds `src/cli/command-inputs.ts` and switches
`tests/cli-capture.ts` to record process stream writes. Tasks 2 to 11 each
convert a group of commands and every test that the conversion breaks, so
`pnpm verify` stays green after each one. Task 12 converts `runCli` and adds
the guard test, so it runs last. No file is shared between tasks.

## Background

**The split.** The queue item `commands-report-failure` asked for three steps:
throw `CommandError` everywhere (141), give every command its inputs as
arguments (this change), and run inbox actions in-process
(`inbox-in-process`). The human split them on 2026-10-02.

**How commands take their inputs today.**

| Commands | cwd / config | Output |
|---|---|---|
| `land`, `sync`, `message`, `graph`, `spec` | both | writers receive raw text |
| `lint` | both | raw `stdout` for `--json`, logger to stderr |
| `status`, `queue`, `show`, `report`, `query`, `digest`, `inbox` (bare) | both | `stdout` receives text without its newline, else `console.log` |
| `doctor`, `serve` | cwd only | `stdout` receives a line without its newline |
| `osq inbox` | both | raw writers in the card session and `--follow`, `console.log` for text and JSON, `console.error` for the wait log |
| `new`, `reject`, `retry`, `approve` | some | `console.log` and `console.warn` |
| `init`, `setup`, `watch` | neither or cwd only | `console.log` or the logger |
| `plan` | cwd only | `process.stdout.write`, `console.log`, `console.error` |
| `migrate` | both | logger to stderr |

**The convention.** Each command's options interface extends
`CommandInputs`. `resolveInputs` fills `cwd` with `process.cwd()`, the writers
with `processStdout` and `processStderr`, and returns `config()`, which gives
the caller's config or `loadConfig(cwd)`. Each command awaits `config()` at
the same point it loaded config before, inside or outside its error handling,
so a configuration error prints and exits as before. `commandLogger` gives the
same process logger as before when no `stderr` is passed, and otherwise a
logger that writes to it. A command that printed with `console.log(text)` now
writes `` `${text}\n` ``, which is the same bytes on the process stream.
Commands keep their positional arguments and their return values.

**What a web caller passes.** An M2 browser action or the in-process inbox
calls the command function, not `runCli`: `cwd` is the project root the
server or inbox already serves, `config` is the config it already loaded,
and `stdout` and `stderr` append to buffers it returns or streams to the
browser. It catches a `CommandError` and reports its message, `next` and
`exitCode` itself. It passes the non-terminal seams too: `isTerminal: () =>
false` for `approve`, and for `osq inbox` its own `input` and `launch`.

**How interactive prompts read input, for `inbox-in-process`.**

- `approve --confirm` asks through its `ask` option, which defaults to a
  `node:readline/promises` question on `process.stdin` and `process.stdout`,
  and only when `isTerminal` says both are TTYs; otherwise it refuses.
- The inbox card session reads keys and the reject reason through its
  `input` option, which defaults to `createTerminalInput(process.stdin)`;
  the reason question now prints through the command's `stdout`.
- The inbox card actions run through its `launch` option, which spawns
  osq's bin with inherited stdio.
- `plan --brief -` reads `process.stdin`; `plan` with no brief opens
  `$VISUAL` or `$EDITOR` with inherited stdio; `plan --session` spawns the
  planner with inherited stdio.

**Measured fallout.** In a scratch worktree with the whole conversion, the
CLI typecheck passed and `pnpm test` failed in 27 test files besides the five
that fail only for lack of a build (`bin-execution`, `package-*`,
`web-export`). After `tests/cli-capture.ts` recorded process writes instead of
console calls, 20 remained, each tied to one command group; every one is in
its task's scope. On today's code that capture change alone breaks only
`tests/lint-command-error.test.ts` and
`tests/sync-graph-migrate-command-error.test.ts`, which wrap `runCliCaptured`
in their own write hooks; task 1 owns them. `tests/serve.test.ts` and
`tests/serve-export.test.ts` hang rather than fail when the trailing newline
is missing from an awaited URL.

**Line budgets.** `src/cli/plan-queue.ts` has 248 lines; the conversion adds
two, which the line budget refuses, so task 10 moves `writePromptHandoff`
into `plan.ts`, its only caller, leaving `plan.ts` near 247.
