# Spec Delta: rust-approve

## Purpose
The approve feature: a human seals a change folder after its gates pass, and only approve, after the hash check, makes an approved change. It holds the feature's logic, its command, its route and its loop hooks, as ADR 022 says.

## ADDED Requirements

### Requirement: Code ownership
<!-- source: crates/features/approve/** -->
The rust-approve capability SHALL own the `osq-feature-approve` crate:
its manifest, its source, its tests and their fixtures.

#### Scenario: Approve crate ownership
- **WHEN** file ownership is resolved for the approve feature
- **THEN** system maps `crates/features/approve/**` to rust-approve
