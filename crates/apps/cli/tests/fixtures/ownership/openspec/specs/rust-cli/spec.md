# rust-cli Specification

## Purpose
The fixture that proves the CLI app's code ownership.

## Requirements

### Requirement: Code ownership
<!-- source: crates/apps/cli/** -->
The rust-cli capability SHALL own the `osq-cli` crate.

#### Scenario: CLI crate ownership
- **WHEN** file ownership is resolved for the CLI app
- **THEN** system maps `crates/apps/cli/**` to rust-cli
