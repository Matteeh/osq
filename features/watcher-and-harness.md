# Watcher and Harness

Describes the execution engine in `osq`: state derivation, locking, harness adapters, task execution and independent verification gates, delta application, and the `watch` and `setup` commands.

## Change Folder State & Markers

State is derived purely from files and markers within `.run/` inside each change folder (`specs/<id>-<name>`):
- `.run/approved`: SHA-256 digest of the change folder (excluding `.run/`, `.git/`, and `.DS_Store`). What runs is strictly what was approved.
- `.run/running/<n>.pid`: Exclusive lock file containing the process ID and start timestamp.
- `.run/done/<n>`: Created by the watcher only after independent verification passes.
- `.run/dead/<n>.md`: Recorded on failures with structured reason and diagnostic details.
- `.run/results/<n>.md`: Written exclusively by coding agents prior to exiting.
- `.run/events/<n>.jsonl`: Append-only event stream (`started`, `tokens`, `file_changed`, `verify_ran`, `result_written`, `exited`).

## Failure Reasons (Dead Letter Queue)

- `verify_red`: Independent watcher verification gate failed.
- `spec_conflict`: Change folder contents modified after approval hash was sealed.
- `no_result`: Agent exited without creating `.run/results/<n>.md`.
- `crashed`: Agent exited with non-zero exit code or terminated abruptly.
- `timeout`: Agent execution exceeded `timeouts.taskTimeoutSeconds`.
- `already_running`: Task lock already held by another active process.

## Exclusive Locking & Stale Lock Reaping

- Locks are acquired atomically using exclusive file flags.
- Reaping checks active locks:
  - If PID is no longer running (signal 0 check fails), reaped to `dead/<n>.md` with `reason: crashed`.
  - If elapsed time exceeds `config.timeouts.staleLockSeconds`, reaped to `dead/<n>.md` with `reason: timeout`.

## Harness Adapters

Harness adapters decouple agent process execution from the watcher:
- `HarnessAdapter`: Defines `setup(projectRoot, config)` and `spawn(options)`.
- `AgyAdapter`: Scaffolds agent directories and executes tasks via the `agy` CLI.
- `MockAdapter`: In-memory and deterministic agent simulation used by unit and integration tests.

## Task Execution & Verification Gate

1. **Pre-spawn Check**: Change folder hash must match `.run/approved`.
2. **Locking**: Exclusive lock `.run/running/<n>.pid` is acquired.
3. **Spawning**: Coding agent spawned via the configured adapter.
4. **Result Verification**: Verifies presence of `.run/results/<n>.md`.
5. **Zero Trust Gate**: Watcher independently executes `task.verify` in the repository root.
6. **Completion**: Writes `.run/done/<n>` and updates `- [x] <n>.` in `tasks.md`.

## Archiving & Delta Application

When all tasks within an approved spec are marked `done`:
- The watcher applies the spec's `## Delta` section to documentation specified in `features.writes`.
- The completed spec folder is moved whole to `specs/archive/<folder>`, preserving its full `.run` marker history and logs.

## Commands

- `osq setup`: Configures the active harness adapter (`OSQ_HARNESS`).
- `osq watch [--once]`: Starts the reactive watcher loop (`chokidar` + heartbeat polling) to execute approved tasks in sequence.

## Delta from OpenCode harness adapter

Update features/watcher-and-harness.md to document the OpenCode adapter (OpencodeAdapter) implementing HarnessAdapter, configuration options (opencode: bin, model, agent, variant), setup behavior creating .opencode/agent/osq-coder.md with managed blocks and strict tool permissions, spawn invocation arguments and file attachment protocol, stdout event stream parsing to tokens events, and watcher preflight verification.

## Delta from Watcher observability

Update features/watcher-and-harness.md to document the unified stderr logger, CLI verbosity flags (--verbose, --quiet), lifecycle logging for started and exited processes, periodic execution heartbeats, the standardized { type: 'tool', data: { tool, summary } } harness event, Antigravity stream-json event translation, runner result synthesis from final text stream events with synthesized: true frontmatter, and single-line task completion and failure outcome logs.

## Delta from Report fixes

Update `features/metrics-and-reporting.md` to document metric derivation rules (sourcing active specs from `deriveSpecState` and archived specs from `events.jsonl`), historical failure tracking by `dead` event reasons across retries, neutral token breakdown with cache-share percentage, reported cost display rules and harness price table disclaimer, file modification extraction from `edit`/`write` tool events, and structured `--json` command output.

Update `features/watcher-and-harness.md` to document the addition of `done` and `dead` events appended to `.run/events/<n>.jsonl` whenever the runner writes a `done/<n>` or `dead/<n>.md` marker file.

## Delta from Observability fixes

Update `features/watcher-and-harness.md` to replace the outdated event stream description with the authoritative list of nine harness events and explicit ownership:
- Runner owns: `started` (with PID and timeout via `onSpawn`), `exited` (with exitCode, PID, elapsedSeconds, timedOut), `result_written` (with path and synthesized flag), `verify_ran` (with command, exitCode, duration), `done` (when verify passes and done marker is written), and `dead` (emitted exclusively when a dead marker file is written).
- Adapters own: `tokens` (promptTokens, candidateTokens, totalTokens, cachedTokens, reasoningTokens, cost), `tool` (tool name and summary), and `text` (final assistant message).
Document the `onSpawn(pid)` callback contract on `SpawnTaskOptions` and `spawnWithTimeout`, and document that result synthesis reads exclusively from `text` events.

Update `features/metrics-and-reporting.md` to document the token metric derivation priority (preferring adapter-reported cache counters over remainder derivation, reserving remainder derivation strictly for events lacking cache fields), reasoning token propagation, and removal of deprecated compatibility aliases from `MetricsReport`.

## Terminal UX & Observability

`osq watch` presents an interactive, single-line status row at the bottom of the terminal alongside a curated stream of permanent log lines:

- **Live Status Row**: Rendered via the logger's stderr sink when connected to an interactive TTY (`process.stderr.isTTY` is true, `--quiet` is unset, and `CI` is unset). The row animates a spinner at an 80ms interval. While running a task, it displays the spinner, task number, elapsed duration, tool invocation count, cumulative tokens, reported cost, and the most recent tool summary truncated to terminal width. While idle, it displays the spinner, watching spec directory, approved specs waiting count, and the last archived spec with its completion age.
- **Environment & Non-TTY Fallback**: When running in non-TTY environments (pipes, redirects) or CI (`CI` environment variable set), dynamic status rendering is disabled and `status()` becomes a no-op. The watcher falls back to logging a periodic heartbeat line at 60-second intervals. Unicode status symbols (`▶`, `✓`, `✗`, `■`) are active only in interactive TTY sessions without `NO_COLOR`; plain text words are used otherwise.
- **Curated Permanent Log Stream**: Permanent output at `info` level is strictly limited to high-signal lifecycle events: spec pick-up upon approval detection, task start with single-line truncated title, task outcome (`verified` or `dead` with failure reason and elapsed duration), spec archival, spec halt on failed tasks, and watcher errors. Diagnostic details (`exited`, synthesized result notices, and TTY-mode heartbeats) are routed exclusively to `verbose` level.
- **Stream Event Routing**: Unrecognised or unstructured harness events are captured by stream parsers and forwarded to `logger.verbose`, emitting zero output to stdout or stderr outside the leveled logger.
- **Signal Handling (SIGINT)**: Upon receiving SIGINT, the watcher clears the active status row, restores the terminal cursor, logs a notice that it is awaiting the active task exit, and waits for clean exit. A second SIGINT immediately forces termination.

## Delta from Status row fixes and outcome log curation

Update `features/watcher-and-harness.md` under `## Terminal UX & Observability` to replace the **Live Status Row** and **Curated Permanent Log Stream** bullet points with the following literal paragraphs:

- **Live Status Row**: Rendered via the logger's stderr sink when connected to an interactive TTY (`process.stderr.isTTY` is true, `--quiet` is unset, and `CI` is unset). The row animates a spinner at an 80ms interval. Truncation is handled entirely within the logger sink: the text is constrained to `stream.columns` (default 80) minus the 2-column spinner prefix (`<frame> `) and capped with an ellipsis (`…`) without applying logger prefixing (such as `[osq]`). While running a task, the row displays the spinner, task number, elapsed duration, tool invocation count, abbreviated cumulative tokens (`<1000` as-is, `X.Xk` below 1M, `X.XM` at or above 1M, with rollover from `1000.0k` to `1.0M`), reported cost, and the most recent tool summary with the project root and trailing separator stripped from absolute paths. While idle, it displays the spinner, watching spec directory, approved specs waiting count, and the last archived spec with its completion age.

- **Curated Permanent Log Stream**: Permanent output at `info` level is strictly limited to high-signal lifecycle events: spec pick-up upon approval detection, task start with single-line truncated title, exactly one task outcome line (`verified` or `dead` with failure reason, diagnostic details, and elapsed duration), spec archival, spec halt on failed tasks, and watcher errors. Diagnostic details (`exited`, synthesized result notices, and TTY-mode heartbeats) are routed exclusively to `verbose` level.
