# beta Specification

## Purpose

## Requirements

### Requirement: Code ownership
<!-- source: crates/alpha/src/shared.rs -->
The beta capability SHALL own the shared helpers.

#### Scenario: Beta ownership
- **WHEN** file ownership is resolved for the shared helpers
- **THEN** system maps `crates/alpha/src/shared.rs` to beta
