---
title: Watch terminal UX
depends_on:
  - 11
features:
  reads:
    - watcher-and-harness
    - cli-foundation
---
## Goal

Provide a clean, focused terminal user experience for `osq watch` that keeps users informed without cluttering terminal scrollback. Replace unbounded scrolling logs with a single animated live status row at the bottom of the terminal alongside a strictly curated stream of permanent log lines representing events a human cares about.

1. Equip the logger's stderr sink with dynamic status capabilities (`status(text: string)` and `clearStatus()`), rendering an 80ms unref'd spinner animation and redrawing cleanly beneath incoming log records without third-party terminal dependencies.
2. Restrict animation and unicode symbols (`▶`, `✓`, `✗`, `■`) to interactive TTY sessions where `process.stderr.isTTY` is true, `--quiet` is unset, and `CI` is unset (respecting `NO_COLOR` for symbols). In non-TTY and CI environments, `status()` is a no-op and the 60-second periodic heartbeat line serves as the fallback.
3. Unify task observation by deriving both the 1-second TTY status row (spinner, task number, elapsed time, tool count, tokens, cost, and truncated tool summary) and the 60-second non-TTY heartbeat log from the shared `computeTaskHeartbeatStats` calculation, maintaining the 009 single-observation invariant.
4. Curate permanent `info` logs to essential milestones: spec picked up, task started (single line with title truncated to terminal width), task outcome (verified or dead with reason and elapsed seconds), spec archived, spec halted due to a dead task, and watcher errors. Demote `task <n> exited`, synthesized result notices, and TTY-mode heartbeats to `verbose`.
5. Eliminate harness stdout leakage by removing `console.debug` in `opencode.ts` and routing all unrecognised stream events to `logger.verbose`.
6. Handle `SIGINT` gracefully by clearing the status row, restoring the terminal cursor, announcing whether the watcher is waiting for the running task to exit or killing it, and terminating cleanly on the second `SIGINT`.

## Invariant

1. Every task progress observation originates from a single code path: `computeTaskHeartbeatStats` supplies the authoritative metrics rendered in both the 1s TTY status row and the 60s non-TTY heartbeat log line.
2. The status row is exclusively managed by the logger's stderr sink; incoming log writes clear the status line (`\r\x1b[2K`), output the message with newline, and redraw the status line below it without line corruption.
3. In non-TTY or CI environments, dynamic status rendering is completely disabled (`status()` is a no-op) and output falls back to plain-text labels and periodic log lines.
4. Harness stdout remains clean: unrecognised stream events must route to `logger.verbose` and never write to stdout.

## Contract

| Component / Trigger | Expected Output / Behavior |
|---|---|
| Logger status row & sink | Logger exposes `status(text: string): void` and `clearStatus(): void`; clears row (`\r\x1b[2K`) on log writes and redraws below; runs unref'd 80ms spinner interval |
| Environment detection & formatting | Animation and symbols (`▶`, `✓`, `✗`, `■`) active only when `stderr.isTTY === true`, `--quiet` unset, `CI` unset, and `NO_COLOR` unset; non-TTY/CI makes `status()` a no-op, uses plain words, and logs 60s heartbeats |
| Task execution status & counters | Shared `computeTaskHeartbeatStats` feeds 1s TTY status row (spinner, task, elapsed, tool count, tokens, cost, truncated tool summary) and 60s non-TTY heartbeat log |
| Watcher loop lifecycle logging | Emits permanent info lines with symbols/words when spec picked up, spec archived, spec halted on dead task, or on watcher error; maintains idle status with specs path, waiting approved specs count, and last archived spec |
| Runner log level demotions | Task start (truncated title) and task outcome (`verified` or `dead` with reason and elapsed) log at info; `exited`, synthesized result notices, and TTY heartbeats demote to verbose |
| Harness unrecognised stream events | `console.debug` removed from `opencode.ts`; unrecognised stream events in `opencode` and `agy` route to `logger.verbose`, never stdout |
| Signal handling (SIGINT) | First SIGINT clears status row, restores cursor, logs waiting notice, awaits running task; second SIGINT terminates process immediately |

## Non-goals

- Adding external terminal UI libraries, curses wrappers, or component frameworks (Ink, Blessed).
- Modifying `events.jsonl` structure, event serialization schema, or marker file protocols.
- Multi-row interactive dashboards, split views, or interactive keyboard navigation.
- Altering task verification logic or folder approval hashing rules.

## Delta (legacy)

### `features/watcher-and-harness.md`

## Terminal UX & Observability

`osq watch` presents an interactive, single-line status row at the bottom of the terminal alongside a curated stream of permanent log lines:

- **Live Status Row**: Rendered via the logger's stderr sink when connected to an interactive TTY (`process.stderr.isTTY` is true, `--quiet` is unset, and `CI` is unset). The row animates a spinner at an 80ms interval. While running a task, it displays the spinner, task number, elapsed duration, tool invocation count, cumulative tokens, reported cost, and the most recent tool summary truncated to terminal width. While idle, it displays the spinner, watching spec directory, approved specs waiting count, and the last archived spec with its completion age.
- **Environment & Non-TTY Fallback**: When running in non-TTY environments (pipes, redirects) or CI (`CI` environment variable set), dynamic status rendering is disabled and `status()` becomes a no-op. The watcher falls back to logging a periodic heartbeat line at 60-second intervals. Unicode status symbols (`▶`, `✓`, `✗`, `■`) are active only in interactive TTY sessions without `NO_COLOR`; plain text words are used otherwise.
- **Curated Permanent Log Stream**: Permanent output at `info` level is strictly limited to high-signal lifecycle events: spec pick-up upon approval detection, task start with single-line truncated title, task outcome (`verified` or `dead` with failure reason and elapsed duration), spec archival, spec halt on failed tasks, and watcher errors. Diagnostic details (`exited`, synthesized result notices, and TTY-mode heartbeats) are routed exclusively to `verbose` level.
- **Stream Event Routing**: Unrecognised or unstructured harness events are captured by stream parsers and forwarded to `logger.verbose`, emitting zero output to stdout or stderr outside the leveled logger.
- **Signal Handling (SIGINT)**: Upon receiving SIGINT, the watcher clears the active status row, restores the terminal cursor, logs a notice that it is awaiting the active task exit, and waits for clean exit. A second SIGINT immediately forces termination.

### `features/cli-foundation.md`

## Leveled Logging & Terminal Output

The `osq` CLI utilizes a unified leveled stderr logger (`createLogger`) supporting `quiet`, `normal`, and `verbose` levels, augmented with interactive status line management:

- **Interactive Status Sink**: The logger exposes `status(text)` and `clearStatus()` methods. When a status text is active on an interactive TTY, incoming log lines clear the status row (`\r\x1b[2K`), write the formatted log line above, and redraw the status row below, ensuring continuous status visibility without interleaving or garbling log records.
- **Terminal Capabilities & Environment Detection**: Animation and terminal control sequences are automatically enabled only when stderr is an interactive TTY, `--quiet` is not specified, and `process.env.CI` is unset. When animation is inactive, status operations are safe no-ops. Color and unicode symbols automatically downgrade to plain text when `NO_COLOR` is present or TTY is absent.