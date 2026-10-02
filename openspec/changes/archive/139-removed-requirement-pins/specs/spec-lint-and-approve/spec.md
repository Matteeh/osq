## ADDED Requirements

### Requirement: Requirement pins skip removed requirements
`tests/living-specs-pins.test.ts` SHALL hold the pinned requirement names per
living capability and SHALL fail with `<capability> is missing preserved
requirement "<name>"` for each pinned name missing from that capability's
living spec, unless a delta in that capability lists the name under
`## REMOVED Requirements` or as the `FROM` of a `## RENAMED Requirements`
pair. The deltas it reads SHALL be those of every folder under
`openspec/changes/archive/` and of every active change folder holding the
record at `archiveSpecsRecordPath`, parsed with `parseDelta`.

#### Scenario: Pinned requirement removed by a delta
- **WHEN** an archived change's `cli-foundation` delta removes a pinned `cli-foundation` requirement and the living spec no longer has it
- **THEN** the pin check passes

#### Scenario: Pinned requirement renamed by a change being archived
- **WHEN** an active change holding the archive record renames a pinned requirement away and the living spec has only the new name
- **THEN** the pin check passes

#### Scenario: Removed in another capability
- **WHEN** a delta removes a requirement of the same name from a different capability
- **THEN** the pin check still fails for the capability whose living spec lost it

#### Scenario: Pinned requirement lost by accident
- **WHEN** a pinned requirement is missing from its living spec and no delta removed or renamed it
- **THEN** the pin check fails naming the capability and the requirement
