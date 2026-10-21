## ADDED Requirements

### Requirement: Code ownership
<!-- source: crates/fresh/**, crates/keep/**, crates/split/** -->
The fresh capability SHALL own the fresh, keep and split crates.

#### Scenario: Fresh ownership
- **WHEN** file ownership is resolved for the fresh, keep and split crates
- **THEN** system maps `crates/fresh/**`, `crates/keep/**` and `crates/split/**` to fresh
