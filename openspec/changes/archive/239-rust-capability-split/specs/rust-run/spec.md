# Spec Delta: rust-run

## Purpose
The run feature hands one task at a time of an approved change to an executor and verifies it. It holds the feature's logic, its command, its route and its loop hooks, as ADR 022 says.

## ADDED Requirements

### Requirement: Code ownership
<!-- source: crates/features/run/** -->
The rust-run capability SHALL own the `osq-feature-run` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Run crate ownership
- **WHEN** file ownership is resolved for the run feature
- **THEN** system maps `crates/features/run/**` to rust-run
