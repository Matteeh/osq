---
queue_item: inbox-in-process
queue_hash: sha256:15d0c41cbe2bdc8f65c7a5426c6198c9172ce34d10605c2d699003d53ed72ac4
planner: null
date: 2026-10-03
---

### Goal

The inbox card session runs each keyed action by calling the command function in its own process, shows the `CommandError` message and next step on failure, and keeps the terminal usable after a failed action.

### Context

As of 2026-10-02:

- Since change 099 the card session launches each action (`approve`, `plan`, `retry`, `reject`, `show`; `src/core/status/dispatch-keys.ts`) as a child process through `createChildLauncher` in `src/cli/inbox-terminal.ts`. Each action pays a Node start and a config load, and the card sees only an exit code (`── exit <code> ──`).
- Change 141 makes commands throw `CommandError`, and `command-inputs` gives them their inputs as arguments. This is step 3 of the follow-up to 111.
- The card session reads keys from stdin in raw mode between actions (`createTerminalInput`). `approve` can ask for confirmation on stdin, and `plan` hands the terminal to an interactive planner.
- M2 (tap in the browser) needs the same in-process call path.

### Requirements

- The card session calls the command for a key in-process with its loaded config and its own writers, and no longer spawns `osq`.
- A failed action prints its `CommandError` message and, when set, its next step, then the card session carries on. `process.exitCode` is unchanged by any action.
- An action that reads stdin or hands over the terminal (`approve`'s confirmation, `plan`'s planner session) works as it does from the shell.
- A `Launcher` stays injectable for tests.

### Non-goals

- Web write actions. This prepares the call path they will use.
- Changing which keys the card shows.

### Notes for planning

- Check raw mode and stdin listeners around in-process actions that read input; a leftover raw mode or listener breaks the terminal.
- Decide whether `createChildLauncher` stays as a fallback or goes, and say why.
