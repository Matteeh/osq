# Spec Delta: rust-land

## Purpose
The land feature merges an archived change onto the default branch: its rules, the land commit, `osq land` and its endpoint. It holds the feature's logic, its command, its route and its loop hooks, as ADR 022 says.

## ADDED Requirements

### Requirement: Code ownership
<!-- source: crates/features/land/** -->
The rust-land capability SHALL own the `osq-feature-land` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Land crate ownership
- **WHEN** file ownership is resolved for the land feature
- **THEN** system maps `crates/features/land/**` to rust-land
