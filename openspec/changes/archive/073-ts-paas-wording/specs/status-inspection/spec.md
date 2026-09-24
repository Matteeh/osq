# Spec Delta: Status Inspection

## MODIFIED Requirements

### Requirement: Detailed specification inspection
<!-- source: features/status-inspection.md # Show command, src/core/show.ts, src/cli/show.ts, src/core/status/pre-spawn-words.ts, tests/show.test.ts, tests/show-pre-spawn.test.ts, tests/show-digest.test.ts, tests/show-pre-spawn-missing.test.ts -->
The system SHALL display detailed task lists, metadata, planning sessions,
recertification decisions, results, and complete event timelines via
`osq show <id>`. Derived recertification history SHALL come from numbered typed
events rather than current or retained marker files. Each task with a pre-spawn
`verify_ran` event SHALL show its latest pre-spawn start in the same words the
watch log uses, from `formatPreSpawnStart`. An unapproved change SHALL also show
its approval digest and flags. `osq show <id> --json` SHALL print the same
details as JSON with a `digest` field, null for an approved change.

#### Scenario: Detailed spec inspection
- **WHEN** user executes `osq show <id>`
- **THEN** system resolves the folder across active and archive paths, displaying frontmatter, task execution table, recertification history when present, and the complete event timeline

#### Scenario: Pre-spawn verify result
- **WHEN** a task's event stream holds a `verify_ran` event with `phase: "pre_spawn"`
- **THEN** the task's entry prints `Pre-spawn verify: ` followed by the start words for the latest such event, such as `started red: verify fails` or `started green, but it declared red`, and a task without one prints no such line

#### Scenario: Pre-spawn verify with missing paths
- **WHEN** the latest pre-spawn event carries a non-empty `missingPaths`
- **THEN** the line reads `started red: <path>, <path> missing` in recorded order, and an empty or absent `missingPaths` words the start from its exit code alone

#### Scenario: Unreadable pre-spawn values
- **WHEN** the latest pre-spawn event lacks a finite exit code or a declared state
- **THEN** the line reads `Pre-spawn verify: unavailable`

#### Scenario: Unapproved change digest
- **WHEN** user executes `osq show <id>` for a change without `.run/approved`
- **THEN** the output ends with the same digest and flag lines `osq approve` would print

#### Scenario: JSON output
- **WHEN** user executes `osq show <id> --json`
- **THEN** stdout is one JSON object with the change details and a `digest` field holding the digest structure, or null when the change is approved
