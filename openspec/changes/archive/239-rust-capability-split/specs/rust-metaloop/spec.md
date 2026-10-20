# Spec Delta: rust-metaloop

## Purpose
The metaloop feature reads task history through the storage read model and proposes changes to rules and skills. It holds the feature's logic, its command, its route and its loop hooks, as ADR 022 says.

## ADDED Requirements

### Requirement: Code ownership
<!-- source: crates/features/metaloop/** -->
The rust-metaloop capability SHALL own the `osq-feature-metaloop`
crate: its manifest, its source, its tests and their fixtures.

#### Scenario: Metaloop crate ownership
- **WHEN** file ownership is resolved for the metaloop feature
- **THEN** system maps `crates/features/metaloop/**` to rust-metaloop
