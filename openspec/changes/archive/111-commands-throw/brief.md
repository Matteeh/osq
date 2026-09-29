---
queue_item: commands-throw
queue_hash: sha256:ec8332d8a8b31290bdddcced47eecd4891f9e41d84ec89ef84239a0afa02fa76
planner: null
date: 2026-09-29
---

### Goal

Every CLI command reports failure by throwing `CommandError`, with a message and an exit code, and `runCli` prints it and sets the exit code in one place. Any caller can then run a command and carry on: the inbox now, and web actions later. Nothing changes for a person at a terminal.

### Context

As of 2026-09-28:

- 18 `process.exit(` calls sit in 13 files under `src/cli/`: `approve.ts`, `check.ts`, `done.ts`, `inbox.ts`, `new.ts`, `queue.ts`, `reject.ts`, `report.ts`, `retry.ts`, `run.ts`, `show.ts`, `status.ts` and `verified.ts`.
- `approveCommand` relies on exiting for its control flow: with several ids, it moves on to the next only because an error ended the process.
- `runCli` in `src/cli/run.ts` already catches `ConfigLoadError` once, prints it and sets the exit code. `CommandError` follows that pattern.
- Seven tests stub `process.exit`: `approve-confirm`, `plan-approve-next-step`, `verification-record`, `cli-config-errors`, `opencode-v2`, `watcher-preflight` and `watcher-loop-logging`. Not all of them stub it for a command.
- The inbox's card session runs each action as a child process because of these exits (change 099). Each action pays a Node start and a config load, and a card can show only the exit code, not why.
- `landCommand` and `messageCommand` already take injectable `stdout`, `stderr` and `exit`.
- Source: the Notion page "Technical debt 27.09 MUST FIX".

### Requirements

- `src/cli/` exports `CommandError`, which carries a message and an exit code.
- No command under `src/cli/` calls `process.exit`. Each throws `CommandError` where it used to exit, so it stops at the same point.
- `runCli` catches `CommandError`, prints its message to stderr, and sets `process.exitCode`, as it does for `ConfigLoadError`.
- Every command prints the same output and exits with the same code as before.
- Tests that stub `process.exit` for a command expect the thrown error instead.

### Non-goals

- Running inbox actions in the same process. That can follow once each command takes its config and working directory as arguments.
- Changing any command's output or exit codes.

### Notes for planning

- Check which exits in `run.ts` belong to the entry point and stay.
- A refactor: `verify_starts: green` for the command files, and `tests.modify: true` for the tests that stub `process.exit` for a command. Measure the fallout in a scratch worktree first, since other tests may assert on exit behaviour.
