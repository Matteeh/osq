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
