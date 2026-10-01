## ADDED Requirements

### Requirement: Report event reads
osq SHALL provide one shared reader for event streams and planning logs. Within
one read scope, it SHALL read each file at most once, parse it at most once,
and give every caller the same parsed events. It SHALL keep the parsed events,
not the file text. A read outside any scope SHALL go to disk every time. A
file that cannot be read SHALL give no events.

#### Scenario: Read outside a scope
- **WHEN** one event file is read twice outside any scope
- **THEN** the file is read from disk twice

#### Scenario: Read inside a scope
- **WHEN** one event file is read twice inside one scope
- **THEN** the file is read from disk once, and both reads give the same events

### Requirement: Report events hold no logs
Events from the shared reader SHALL be frozen, and SHALL leave out the `output`
log of `verify_ran`, `regressed`, and `recertification` events. The event
files SHALL keep those logs.

#### Scenario: A reader changes an event
- **WHEN** code assigns to an event, or to its `data`, that the shared reader gave it
- **THEN** the assignment throws

#### Scenario: Verify log left out
- **WHEN** an event file holds a `verify_ran` event with an `output` log
- **THEN** the parsed event has its exit code, duration, and timestamp but no `output`, and the file still holds the log

### Requirement: Report reads each event file once
One `osq report` run SHALL be one read scope, and SHALL end it when the report
is built, keeping nothing for a later run and writing nothing to disk. Every
module under `src/core/report/` that the report uses SHALL read event streams
and planning logs through the shared reader, and SHALL NOT change the events
it is given. The report's text and JSON output SHALL be the same as reading
every file separately.

#### Scenario: One report run over several archived changes
- **WHEN** the report runs over a project with several archived changes, each with task streams, a change stream, and a `plan.jsonl`
- **THEN** no `.jsonl` file is opened more than once, and the report equals the one the existing tests pin

#### Scenario: Two report runs
- **WHEN** the report runs twice in one process, and an event stream gains a line between the runs
- **THEN** the second report counts that line

#### Scenario: A module parses events by itself
- **WHEN** a module under `src/core/report/`, other than the shared reader and the change digest's archive reader, parses event lines by itself
- **THEN** `tests/report-reads-once.test.ts` fails and names the module
