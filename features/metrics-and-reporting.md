# Metrics And Reporting

Create features/metrics-and-reporting.md documenting osq report, metric calculation rules, failure categorization by dead reason, and the --json flag.

## Delta from Report fixes

Update `features/metrics-and-reporting.md` to document metric derivation rules (sourcing active specs from `deriveSpecState` and archived specs from `events.jsonl`), historical failure tracking by `dead` event reasons across retries, neutral token breakdown with cache-share percentage, reported cost display rules and harness price table disclaimer, file modification extraction from `edit`/`write` tool events, and structured `--json` command output.

Update `features/watcher-and-harness.md` to document the addition of `done` and `dead` events appended to `.run/events/<n>.jsonl` whenever the runner writes a `done/<n>` or `dead/<n>.md` marker file.
