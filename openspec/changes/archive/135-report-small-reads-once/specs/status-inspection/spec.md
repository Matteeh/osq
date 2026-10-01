## ADDED Requirements

### Requirement: Change snapshots share the report's reads
A change folder snapshot SHALL read its task files, and the queue scan SHALL
read each change's `brief.md`, through the report's shared change-file reads,
so one `osq report` run reads each of those files once however many times it
scans the queue or reads a change's state. Outside a report run, each SHALL
read from disk as before: a task file that cannot be read fails the snapshot,
and a missing or unreadable brief leaves the change out of the queue scan.

#### Scenario: Queue scanned several times in one report run
- **WHEN** one `osq report` run scans the queue four times over archived changes whose briefs name queue items
- **THEN** each `brief.md` is read once, and each change's task files are read once
