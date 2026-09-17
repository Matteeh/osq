---
title: Watcher and harness
depends_on: [002]
features:
  reads: [cli-foundation, spec-lint-and-approve]
  writes: [watcher-and-harness]
---
## Goal

Provide the core autonomous execution engine for osq: change folder state derivation, exclusive locking with stale lock reaping, harness adapter abstraction for agent execution, independent watcher verification gates, automatic feature delta application, spec archiving, and the osq watch and setup CLI commands.

## Contract

| Command / Trigger | Expected Output |
|---|---|
| osq setup | Writes harness configuration for current harness adapter (OSQ_HARNESS) |
| osq watch [--once] | Reaps stale locks, dispatches approved tasks sequentially, verifies independently, archives on completion |

## Non-goals

- Multi-agent concurrency above 1 and git worktree isolation.
- SQLite global index ~/.osq/.
- OpenSpec import shims.

## Delta

Create features/watcher-and-harness.md documenting state markers, lock reaping, harness adapter contracts, execution and verification gates, delta application, and watch/setup CLI commands.
