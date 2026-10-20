# rust-runners Specification

## Purpose
The runners kernel sits between the loop and the harnesses and owns what every harness shares: the harness and model per role, checking the model exists at startup, timeouts, retries, the usage-limit pause and logging.

## Requirements

### Requirement: Code ownership
<!-- source: crates/kernel/runners/** -->
The rust-runners capability SHALL own the `osq-kernel-runners` crate:
its manifest, its source, its tests and their fixtures.

#### Scenario: Runners crate ownership
- **WHEN** file ownership is resolved for the runners kernel
- **THEN** system maps `crates/kernel/runners/**` to rust-runners
