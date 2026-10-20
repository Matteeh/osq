## ADDED Requirements

### Requirement: Code ownership
<!-- source: crates/fresh/**, crates/keep/src/lib.rs -->
The fresh capability SHALL own the fresh crate and the keep crate's library.

#### Scenario: Fresh ownership
- **WHEN** file ownership is resolved for the fresh crate
- **THEN** system maps `crates/fresh/**` and `crates/keep/src/lib.rs` to fresh
