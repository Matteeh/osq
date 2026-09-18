---
title: Report fixes
depends_on:
  - 9
features:
  reads:
    - metrics-and-reporting
    - watcher-and-harness
---
## Goal

Fix reporting discrepancies in `osq report` against active and archived specifications. Ensure archived specifications never report pending tasks by sourcing task states from append-only events (`events.jsonl`) with marker fallback, while active specifications source state exclusively from `deriveSpecState`. Retain full failure history across task retries by counting historical `dead` events grouped by failure reason. Report token usage with harness-neutral categories (`input`, `cached_input`, `output`, `reasoning`) and include cache-share percentages. Display total and per-spec reported costs whenever harness events provide cost data. Derive file modification metrics from `edit` and `write` tool events deduplicated by path. Provide stable, machine-readable JSON output with sorted keys via `osq report --json`.

## Invariant

`deriveSpecState` and `.run/events/*.jsonl` are the only sources of truth for spec and task status; custom marker or checkbox parsing inside reporting is forbidden.

## Contract

| Metric / Command | Expected Behavior / Output Shape |
|---|---|
| Active spec status | Derived exclusively via `deriveSpecState`; uncompleted tasks report pending, running, or dead |
| Archived spec status | Derived from `done` and `dead` events in `events.jsonl` with marker fallback; never reports pending |
| Historical failures | Groups and sums all `dead` events in history by `reason`, preserving failure counts across task retries |
| Token metrics | Emits `input`, `cached_input`, `output`, `reasoning`, `total`, and `cacheSharePercent` with neutral labels |
| Reported cost | Sums `cost` per spec and total; displays "Reported cost" in text report and omits line when cost is zero |
| File change metrics | Counts `edit` and `write` tool events; reports total change events and deduplicated unique file paths |
| JSON output (`--json`) | Emits single JSON object matching `MetricsReport` with sorted keys and no extraneous stdout |

## Non-goals

- Adding Claude Code harness adapter or altering token/tool event emission in existing adapters.
- Implementing `osq plan`, `osq archive`, `osq doctor`, or `osq lint`.
- Implementing task retry commands or dedicated dead-history filesystem directories.
- Web dashboards, HTML generation, or interactive graphical charts.
- Calculating costs from an internal price table rather than values reported by harness events.

## Delta (legacy)

Update `features/metrics-and-reporting.md` to document metric derivation rules (sourcing active specs from `deriveSpecState` and archived specs from `events.jsonl`), historical failure tracking by `dead` event reasons across retries, neutral token breakdown with cache-share percentage, reported cost display rules and harness price table disclaimer, file modification extraction from `edit`/`write` tool events, and structured `--json` command output.

Update `features/watcher-and-harness.md` to document the addition of `done` and `dead` events appended to `.run/events/<n>.jsonl` whenever the runner writes a `done/<n>` or `dead/<n>.md` marker file.
