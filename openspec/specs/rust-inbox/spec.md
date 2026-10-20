# rust-inbox Specification

## Purpose
The inbox feature lists what needs a human, read only through the storage read model. It holds the feature's logic, its command, its route and its loop hooks, as ADR 022 says.

## Requirements

### Requirement: Code ownership
<!-- source: crates/features/inbox/** -->
The rust-inbox capability SHALL own the `osq-feature-inbox` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Inbox crate ownership
- **WHEN** file ownership is resolved for the inbox feature
- **THEN** system maps `crates/features/inbox/**` to rust-inbox
