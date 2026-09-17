---
title: Show command
depends_on: [005]
features:
  reads: [cli-foundation, watcher-and-harness, status-inspection]
  writes: [status-inspection]
---
## Goal

Provide the osq show <id> command to inspect a specific change folder (either active in specs/ or archived in specs/archive/), displaying spec goals and contracts, individual task states, agent result notes, failure diagnostics for dead tasks, and a chronological event timeline.

## Contract

| Command | Expected Output |
|---|---|
| osq show <id> | Displays spec metadata, contract, task details, agent results, dead markers, and event timeline |

## Non-goals

- Modifying or clearing task state markers (inspection only).
- Aggregate metrics across multiple specs (reserved for osq report).

## Delta

Update features/status-inspection.md to describe osq show <id>, its cross-directory resolution, and its detailed output sections.
