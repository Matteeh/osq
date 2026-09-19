---
title: Raw measures and a run manifest
depends_on:
  - "025"
features:
  reads:
    - watcher-and-harness
    - spec-lint-and-approve
---
## Goal

Metrics that are not captured now cannot be asked about later. Every task run must carry the raw numbers and the exact inputs it was produced with.

At approval, write `.run/manifest.json` with content-addressed hashes of `AGENTS.md`, `PLANNER.md`, the config file, and each capability spec the change reads or writes, plus the osq version, harness, model, effort setting, and the time created and approved.

At task start and end, emit a `measures` event with: files and lines under `scope`, files and lines actually changed within scope (hash before and after, no git), total repo files and lines excluding ignored paths, the count of files importing the scoped files, word counts of the proposal and task body, and the number of requirements and scenarios in the deltas.

Store raw values only; derive nothing here.

## Contract

| Component / Trigger | Expected Output / Behavior |
|---|---|
| `osq approve 026` | `.run/manifest.json` written with hashes, version, harness, model, effort, timestamps |
| Manifest hashes | `sha256:<hex>` per file or `null` when absent |
| Task start | `measures` event with `phase: "start"`, scope/repo/import counts, word counts, delta counts |
| Task end | `measures` event with `phase: "end"`, same counts plus `changedFiles`, `changedLines`, `scopeHashes` |
| Single emission path | One `emitMeasures` function produces both start and end events |
| Golden fixture | `tests/fixtures/events/verified.jsonl` and `dead.jsonl` include measures events |

## Non-goals

- Deriving rates, ratios, or aggregates from raw values.
- Introducing a new report command or modifying existing report output.
- Reading git history or staging area for change detection.
- Making effort configurable in this change; `effort` is `null` until a config field exists.

## Human steps

None.

## Delta

This change adds run manifest generation at approval time and raw measures event emission at task start and end to `watcher-and-harness` and `metrics-and-reporting`.
