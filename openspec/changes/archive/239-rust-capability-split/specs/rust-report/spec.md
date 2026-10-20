# Spec Delta: rust-report

## Purpose
The report feature displays the read model through `osq report`, `osq query` and the dashboard. It does not own the read model's queries. It holds the feature's logic, its command, its route and its loop hooks, as ADR 022 says.

## ADDED Requirements

### Requirement: Code ownership
<!-- source: crates/features/report/** -->
The rust-report capability SHALL own the `osq-feature-report` crate:
its manifest, its source, its tests and their fixtures.

#### Scenario: Report crate ownership
- **WHEN** file ownership is resolved for the report feature
- **THEN** system maps `crates/features/report/**` to rust-report
