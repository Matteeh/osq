# Spec Delta: Spec Lint and Approve

## ADDED Requirements

### Requirement: Living spec replay in landing order
<!-- source: tests/living-specs-delta-equivalence.test.ts -->
The living-spec replay test SHALL rebuild each living capability spec by
merging archived deltas in landing order. Archives without a change-level
`archived` event SHALL come first, in folder-name order. Archives with one
SHALL follow, ordered by that event's timestamp and then by folder name. The
landing time SHALL be read with `readLandedAt`, the same reader the dashboard
uses.

#### Scenario: Later number landed first
- **WHEN** a later-numbered change archived before an earlier-numbered one and both write the same capability
- **THEN** the replay merges the earlier-landed delta first and matches the living spec

#### Scenario: Archives before the event existed
- **WHEN** archives lack an `archived` event
- **THEN** the replay merges them first, in folder-name order
