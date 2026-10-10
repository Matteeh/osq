# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Emptied capability removed
`applyOpenSpecDeltas`, which archive and the land sync's
`rebuildLivingSpecs` both call, SHALL merge each delta through
`mergeLivingSpec(baseContent, capability, delta)`. That function returns the
text `mergeDelta` returns, or null when that text has no requirement. On
null, it SHALL remove `<openspecRoot>/specs/<capability>/spec.md` and
`osq.yml`, then the folder when it is empty, and write nothing for that
capability. `restoreArchiveSpecs` SHALL put both files back from the archive
record after a red or interrupted change-level verify, as it does for any
other capability the change writes.

#### Scenario: Last requirement removed
- **WHEN** a change whose delta removes both requirements of `gadgets`, which has `spec.md` and `osq.yml`, archives through `applyArchiveSpecs`
- **THEN** `openspec/specs/gadgets/` does not exist

#### Scenario: Restored after a red verify
- **WHEN** `restoreArchiveSpecs` runs for that change
- **THEN** `openspec/specs/gadgets/spec.md` and `osq.yml` hold their bytes from before the archive

#### Scenario: Some requirements left
- **WHEN** a delta removes one of the two requirements of `gadgets`
- **THEN** `openspec/specs/gadgets/spec.md` holds the other requirement and `osq.yml` is unchanged
