# rust-archive Specification

## Purpose
The archive feature applies an approved change's deltas to the living specs and moves the change to the archive. It holds the feature's logic, its command, its route and its loop hooks, as ADR 022 says.

## Requirements

### Requirement: Code ownership
<!-- source: crates/features/archive/** -->
The rust-archive capability SHALL own the `osq-feature-archive` crate:
its manifest, its source, its tests and their fixtures.

#### Scenario: Archive crate ownership
- **WHEN** file ownership is resolved for the archive feature
- **THEN** system maps `crates/features/archive/**` to rust-archive
