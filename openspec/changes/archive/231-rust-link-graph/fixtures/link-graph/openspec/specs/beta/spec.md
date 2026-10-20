# beta Specification

## Purpose
The beta capability of the link graph fixture.

## Requirements

### Requirement: Code ownership
<!-- source: crates/beta/src/lib.rs, crates/alpha/src/shared.rs -->
The beta capability SHALL own the beta crate's library and alpha's shared file.

#### Scenario: Beta ownership
- **WHEN** file ownership is resolved for the beta crate
- **THEN** system maps `crates/beta/src/lib.rs` and `crates/alpha/src/shared.rs` to beta

### Requirement: Formats text
The system SHALL format text.

#### Scenario: Plain text
- **WHEN** plain text is formatted
- **THEN** it is unchanged
