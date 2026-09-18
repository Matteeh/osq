---
title: Status command
depends_on:
  - 3
features:
  reads:
    - cli-foundation
    - watcher-and-harness
---
## Goal

Provide the osq status command to give developers and agents an overview of all active change folders, their approval status, individual task progress (pending, running, done, dead with reason), and archived spec counts.

## Contract

| Command | Expected Output |
|---|---|
| osq status | Prints overview of active specs, their tasks with state indicators, and archive count |

## Non-goals

- Detailed timeline visualization (reserved for osq show).
- Global metrics or cost calculation (reserved for osq report).

## Delta (legacy)

Create features/status-inspection.md documenting the osq status command, state indicators, and output formats.
