# Spec Delta: Status Inspection

## ADDED Requirements

### Requirement: Planning session inspection
<!-- source: src/core/show.ts, tests/show.test.ts -->
`osq show <id>` SHALL read `.run/plan.jsonl`, correlate lifecycle records by
planning-session identifier, and list sessions in start order with harness,
model, start time, exit code, and wall seconds. Missing or malformed planning
logs SHALL not prevent the remaining change details from rendering.

#### Scenario: Inspecting repeated planning
- **WHEN** a change has more than one planning lifecycle pair
- **THEN** show output lists every session and its recorded wall time before the task event timeline

#### Scenario: Incomplete or malformed planning history
- **WHEN** a planning session lacks a matching exit record or the log contains malformed lines
- **THEN** show retains the valid session with unavailable exit fields and continues rendering tasks and events
