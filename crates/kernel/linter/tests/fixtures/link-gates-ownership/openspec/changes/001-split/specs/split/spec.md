## ADDED Requirements

### Requirement: Splits numbers
The system SHALL split a number in two.

#### Scenario: Split four
- **WHEN** four is split
- **THEN** both halves are two

### Requirement: Code ownership
<!-- source: crates/split/** -->
The split capability SHALL own the split crate.

#### Scenario: Split ownership
- **WHEN** file ownership is resolved for the split crate
- **THEN** system maps `crates/split/**` to split
