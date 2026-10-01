## ADDED Requirements

### Requirement: Queue report shares the report's reads
The queue report's archive time SHALL come from the first valid `archived`
event in the change's `change.jsonl`, read through the report's shared event
reader, so a report run that already read that stream does not read it again.

#### Scenario: Archived queue item inside a report run
- **WHEN** `osq report` lists a queue item whose change is archived
- **THEN** that change's `change.jsonl` is read once in the run, and the item's archive time is the first valid `archived` event's timestamp
