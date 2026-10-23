---
queue_item: landed-change-commands
queue_hash: sha256:061417d828c291bc11ba17403aa6e09081d42ff40f1c38e4a99565b4afcb9aa4
planner: null
date: 2026-10-21
---

### Goal

Two commands misbehave on a change that is already archived or landed. `osq retry` cannot clear a land-time regression on an archived change, and `osq plan <id>` for a landed change creates a junk change folder before it fails.

### Context

As of 2026-10-21:

- Landing 248: a `sync_verify_red` regression on the archived change could not be cleared with `osq retry`, which could not find the change, so the marker was removed by hand.
- `osq plan 248` after it landed created `250-248` before failing on the missing brief.

### Requirements

- `osq retry <id>` on an archived change with a land-time regression clears it as it does for an active change, or prints the exact command that does.
- `osq plan <id>` for an archived or landed change writes nothing and prints that the change is landed and how to start a new item.
- Tests cover both on fixture repositories.

### Non-goals

- Retrying task-level regressions of archived changes.
