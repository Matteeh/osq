---
queue_item: command-inputs
queue_hash: sha256:34937691b8ccd361aedf9a98fc29d5a322ec9af6165622d51064cee9cea441ac
planner: null
date: 2026-10-02
---

### Goal

Every osq command takes its working directory, config, and stdout and stderr writers as arguments in one convention, so another piece of code can run any command in-process and capture exactly what it prints.

### Context

As of 2026-10-02:

- Change 141 (commands-report-failure) makes every command report failure by throwing a `CommandError`. It was step 1 of three; this is step 2, split off on 2026-10-02 because together they were too big for one change.
- Commands take their inputs in mixed ways. Most call `process.cwd()` and `loadConfig` when no `cwd` or `config` is passed, and several accept neither (`setup`, `status`, `watch`, `init`). Writers follow two conventions: `land`, `sync`, `message`, `graph`, `spec` and `lint` take a writer that receives raw text, while `report`, `queue`, `query`, `digest`, `inbox`, `doctor` and `serve` take one that receives output without its trailing newline. Many commands print with `console.log` and have no writer at all, and few accept `stderr`.
- 114 test files import from `src/cli/`. About 48 of them capture output through the second convention's `stdout` option.
- The Notion page "Follow-up to 111: every command reports failure the same way, and the inbox runs actions in-process" has the analysis.

### Requirements

- Every command function accepts `cwd`, `config`, `stdout` and `stderr` with the same names and meaning. Writers receive exact text, newlines included.
- When a caller passes none of them, each command behaves as today: `process.cwd()`, `loadConfig`, and the process streams.
- No command calls `console.*`, `process.stdout.write` or `process.stderr.write` directly, except through its default writers, and a test enforces it.
- Each command's stdout, stderr and exit code stay byte-identical through `runCli`.

### Non-goals

- Running inbox card actions in-process; that is `inbox-in-process`.
- Changing what any command prints.
- Interactive prompts such as `approve`'s confirmation; record in the proposal how they read input, for `inbox-in-process`.

### Notes for planning

- Measure test fallout in a scratch worktree first: changing the second writer convention breaks tests that join captured lines or compare exact strings.
- Shape the arguments with M2's browser actions in mind as well as the terminal inbox, and say in the proposal what a web caller would pass.
- Split commands across tasks so each task's tests move with its commands.
