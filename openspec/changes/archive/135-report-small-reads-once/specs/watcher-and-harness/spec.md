## ADDED Requirements

### Requirement: Trusted manifest approval time shares the report's reads
The trusted approval time of a change SHALL be the manifest's `approvedAt`
only when the change folder holds `.run/approved` and the value parses as a
date. It SHALL read `.run/manifest.json` through the report's shared
change-file reads, so one `osq report` run reads each manifest once however
many report paths ask for its approval time. Outside a report run it SHALL
read the manifest from disk each time, and a missing, unreadable, or malformed
manifest SHALL give no approval time.

#### Scenario: Approval time asked twice in one report run
- **WHEN** one `osq report` run asks for an approved change's trusted approval time from two report paths
- **THEN** its `.run/manifest.json` is read once, and both get the manifest's `approvedAt`

#### Scenario: Unmarked approval time
- **WHEN** a change's manifest has a valid `approvedAt` but the folder has no `.run/approved`
- **THEN** the change has no trusted approval time
