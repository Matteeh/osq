# delta Specification

## Purpose
The delta capability of the link gates change fixture.

## Requirements

### Requirement: Code ownership
<!-- source: crates/delta/** -->
The delta capability SHALL own the delta crate.

#### Scenario: Delta ownership
- **WHEN** file ownership is resolved for the delta crate
- **THEN** system maps `crates/delta/**` to delta

### Requirement: Adds numbers
The system SHALL add two numbers.

#### Scenario: Two plus two
- **WHEN** two and two are added
- **THEN** the sum is four

### Requirement: Resets totals
The system SHALL reset a total to zero.

#### Scenario: Reset to zero
- **WHEN** a total is reset
- **THEN** it is zero
