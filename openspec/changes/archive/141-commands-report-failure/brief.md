---
queue_item: commands-report-failure
queue_hash: sha256:3057a3f4323b5db998ebf96f1476ebe94004a342aafe7633725ba102370f3dfb
planner: null
date: 2026-10-02
---

### Goal

Every osq command reports failure by throwing a `CommandError`, takes its output writers as arguments, and the inbox card session runs actions in its own process, showing the error's message instead of only an exit code.

### Context

As of 2026-10-02:

- Change 111 moved the commands that called `process.exit` to `CommandError`, which `runCli` prints once. A second group never called `process.exit` and still sets `process.exitCode` itself: `land`, `message`, `sync` and `graph` (through an injectable `exit` option), `lint`, `doctor`, `migrate`, the `plan` and `serve` wrappers in `src/cli/index.ts`, `inbox-dispatch.ts`, and `plan-queue.ts`.
- The inbox card session runs each action as a child process (`createChildLauncher` in `src/cli/inbox-terminal.ts`), paying a Node start and a config load each time, and sees only the exit code.
- M2 (tap in the browser) needs commands it can call in-process and carry on after.
- The Notion page "Follow-up to 111: every command reports failure the same way, and the inbox runs actions in-process" has the full analysis.

### Requirements

- No file in `src/cli/` other than `run.ts` sets `process.exitCode`, and a test enforces it next to 111's `process.exit` guard.
- Each command's stdout, stderr and exit code stay byte-identical.
- Commands take config, working directory, and stdout and stderr writers as arguments. The injectable `exit` option goes.
- The inbox card session calls the command function in-process, prints the `CommandError` message and its next step on failure, and keeps the terminal usable after a failed action.

### Non-goals

- `process.exit` outside `src/cli/`: the watcher's signal and preflight exits, and the harness adapters.
- Web write actions. This only prepares for them.

### Notes for planning

- Measure test fallout in a scratch worktree first. `land`, `message`, `sync` and `graph` tests use the injected `exit`, and any test that calls `runCli` must restore `process.exitCode` (`tests/cli-capture.ts`).
- Through `runCli`, a successful `osq approve` runs the planning readers, so tests point `CODEX_HOME`, `OSQ_CLAUDE_PROJECTS_DIR`, `CLAUDE_CONFIG_DIR` and `OPENCODE_PATH` at a temporary folder.
- This may be two changes, commands first and the in-process inbox second; split it if the scope is over the limits.
