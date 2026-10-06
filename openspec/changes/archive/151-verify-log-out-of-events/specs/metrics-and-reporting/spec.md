## MODIFIED Requirements

### Requirement: Report events hold no logs
Events from the shared reader SHALL be frozen, and SHALL leave out the `output`
of `verify_ran`, `regressed`, and `recertification` events. The event files
SHALL keep that output. When a `verify_ran` event has a `log`, its output is a
tail and the whole log is in the file `log` names.

#### Scenario: A reader changes an event
- **WHEN** code assigns to an event, or to its `data`, that the shared reader gave it
- **THEN** the assignment throws

#### Scenario: Verify log left out
- **WHEN** an event file holds a `verify_ran` event with an `output` log
- **THEN** the parsed event has its exit code, duration, and timestamp but no `output`, and the file still holds the log
