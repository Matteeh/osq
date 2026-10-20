# rust-plan Specification

## Purpose
The plan feature: a planner writes a change folder. It holds the feature's logic, its command, its route and its loop hooks, as ADR 022 says.

## Requirements

### Requirement: Code ownership
<!-- source: crates/features/plan/** -->
The rust-plan capability SHALL own the `osq-feature-plan` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Plan crate ownership
- **WHEN** file ownership is resolved for the plan feature
- **THEN** system maps `crates/features/plan/**` to rust-plan
