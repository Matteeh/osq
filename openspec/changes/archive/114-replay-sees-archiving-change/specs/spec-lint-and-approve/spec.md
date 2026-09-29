## MODIFIED Requirements

### Requirement: Living spec replay in landing order
<!-- source: tests/living-specs-delta-equivalence.test.ts -->
The living-spec replay test SHALL rebuild each living capability spec by
merging archived deltas in landing order: archives without a change-level
`archived` event first, in folder-name order, then the rest by that event's
timestamp and folder name, read with `readLandedAt`. It SHALL then merge, in
folder-name order, each active change folder holding the record at
`archiveSpecsRecordPath`, whose deltas archive has already applied for the
change-level `verify`.

#### Scenario: Later number landed first
- **WHEN** a later-numbered change archived before an earlier-numbered one and both write the same capability
- **THEN** the replay merges the earlier-landed delta first and matches the living spec

#### Scenario: Archives before the event existed
- **WHEN** archives lack an `archived` event
- **THEN** the replay merges them first, in folder-name order

#### Scenario: Change being archived
- **WHEN** `openspec/changes/` holds `archive/`, an active `002-b` with the archive record, an active `001-a` with the record, and an active `003-c` without it
- **THEN** the replay picks up `001-a` then `002-b` after the archived folders, and leaves out `003-c`
