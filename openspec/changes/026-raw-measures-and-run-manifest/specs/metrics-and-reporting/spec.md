## ADDED Requirements

### Requirement: Manifest and measures schema
<!-- source: src/core/manifest.ts, src/watcher/measures.ts, src/harness/types.ts -->
The metrics subsystem SHALL define typed interfaces for `ManifestData` and `MeasuresEventData` so downstream report consumers can read them without ad-hoc parsing.

#### Scenario: Typed manifest interface
- **WHEN** manifest data is produced or consumed
- **THEN** `ManifestData` interface declares `hashes`, `osqVersion`, `harness`, `model`, `effort`, `createdAt`, and `approvedAt`

#### Scenario: Typed measures event interface
- **WHEN** measures event data is produced or consumed
- **THEN** `MeasuresEventData` interface declares `phase`, scope/repo/changed counts, word counts, delta counts, and optional `scopeHashes`
