## ADDED Requirements

### Requirement: History lookup in managed blocks
The managed `PLANNER.md` block SHALL tell planners to look up osq's own
history with `osq query "<select>"`, that `osq query` alone lists its tables,
to add `LIMIT`, and not to open event files for it. The executor protocol's
"Where things live" section SHALL say the same for archived changes.

#### Scenario: Fresh init
- **WHEN** `osq init` writes the managed blocks into a new project
- **THEN** `PLANNER.md` and the executor protocol in `AGENTS.md` each name `osq query` and `LIMIT`
