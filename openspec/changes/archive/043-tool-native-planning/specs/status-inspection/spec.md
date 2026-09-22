# Spec Delta: Status Inspection

## MODIFIED Requirements

### Requirement: Planning session inspection
<!-- source: src/core/show.ts, src/core/planning.ts, tests/show.test.ts -->
`osq show <id>` SHALL read `.run/plan.jsonl`, correlate valid owned and observed
lifecycle records by planning-session identifier, and list complete and
incomplete sessions in start order with the established harness, nullable
model, start time, exit code, and wall seconds fields. A legacy record without
source SHALL remain readable as owned.

Missing fields, malformed lines, and incomplete lifecycle pairs SHALL not
prevent task details or the event timeline from rendering, and no missing value
shall be estimated.

#### Scenario: Inspecting repeated planning
- **WHEN** a change has more than one valid owned or observed lifecycle
- **THEN** show lists every session and its recorded wall time before the task event timeline

#### Scenario: Incomplete or malformed planning history
- **WHEN** a planning start lacks a matching exit or the log contains malformed lines
- **THEN** show retains the valid start with unavailable exit fields and continues rendering tasks and events

#### Scenario: Owned and observed sessions are inspected
- **WHEN** a change has valid sessions from both sources
- **THEN** show lists both uniformly in start order with their observed identity and timing fields

#### Scenario: Legacy or incomplete planning history
- **WHEN** a legacy pair lacks source or a valid start lacks its exit
- **THEN** the legacy pair is labeled owned, unavailable exit fields remain unavailable, and remaining change details still render
