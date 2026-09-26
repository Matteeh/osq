# Spec Delta: Status Inspection

## ADDED Requirements

### Requirement: Instructions changed in show
<!-- source: src/core/status/show.ts, tests/instructions-drift.test.ts -->
`osq show` SHALL print, under each task whose stream holds an
`instructions_changed` event, the line
`      Instructions changed after approval: <changed joined by ", ">` from the
latest such event. Other tasks' output SHALL be unchanged.

#### Scenario: Marked task
- **WHEN** task 2's stream holds an `instructions_changed` event with `changed: ["AGENTS.md", "ADR 009 added"]`
- **THEN** `osq show` prints `      Instructions changed after approval: AGENTS.md, ADR 009 added` under task 2
