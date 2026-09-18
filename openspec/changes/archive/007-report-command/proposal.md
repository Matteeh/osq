---
title: Report command
depends_on:
  - 6
features:
  reads:
    - cli-foundation
    - watcher-and-harness
    - status-inspection
---
## Goal

Provide the osq report command to compute and display project-wide delivery metrics across active and archived change folders, including task completion rates, failure breakdown by dead reason, execution durations, token consumption, and file drift.

## Contract

| Command | Expected Output |
|---|---|
| osq report | Displays project summary, completion rates, failure breakdown by dead reason, token usage, and execution durations |

## Non-goals

- Cross-repository SQLite indexing under ~/.osq/ (future milestone).
- Modifying or clearing task states or event logs.

## Delta (legacy)

Create features/metrics-and-reporting.md documenting osq report, metric calculation rules, failure categorization by dead reason, and the --json flag.
