# Metrics And Reporting

Create features/metrics-and-reporting.md documenting osq report, metric calculation rules, failure categorization by dead reason, and the --json flag.

## Delta from Report fixes

Update `features/metrics-and-reporting.md` to document metric derivation rules (sourcing active specs from `deriveSpecState` and archived specs from `events.jsonl`), historical failure tracking by `dead` event reasons across retries, neutral token breakdown with cache-share percentage, reported cost display rules and harness price table disclaimer, file modification extraction from `edit`/`write` tool events, and structured `--json` command output.

Update `features/watcher-and-harness.md` to document the addition of `done` and `dead` events appended to `.run/events/<n>.jsonl` whenever the runner writes a `done/<n>` or `dead/<n>.md` marker file.

## Delta from Observability fixes

Update `features/watcher-and-harness.md` to replace the outdated event stream description with the authoritative list of nine harness events and explicit ownership:
- Runner owns: `started` (with PID and timeout via `onSpawn`), `exited` (with exitCode, PID, elapsedSeconds, timedOut), `result_written` (with path and synthesized flag), `verify_ran` (with command, exitCode, duration), `done` (when verify passes and done marker is written), and `dead` (emitted exclusively when a dead marker file is written).
- Adapters own: `tokens` (promptTokens, candidateTokens, totalTokens, cachedTokens, reasoningTokens, cost), `tool` (tool name and summary), and `text` (final assistant message).
Document the `onSpawn(pid)` callback contract on `SpawnTaskOptions` and `spawnWithTimeout`, and document that result synthesis reads exclusively from `text` events.

Update `features/metrics-and-reporting.md` to document the token metric derivation priority (preferring adapter-reported cache counters over remainder derivation, reserving remainder derivation strictly for events lacking cache fields), reasoning token propagation, and removal of deprecated compatibility aliases from `MetricsReport`.
