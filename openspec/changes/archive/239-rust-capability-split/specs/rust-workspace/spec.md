## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: crates/apps/cli/** -->
The rust-workspace capability SHALL own the placeholder crates of the
Rust workspace that have no capability of their own: the `cli` app
crate. Every kernel and feature placeholder crate belongs to the `rust`
capability named after it.

#### Scenario: Placeholder crate ownership
- **WHEN** file ownership is resolved for a placeholder crate
- **THEN** system maps `crates/apps/cli/**` to rust-workspace
