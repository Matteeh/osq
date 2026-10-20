# alpha Specification

## Purpose
The alpha capability of the link graph fixture.

## Requirements

### Requirement: Code ownership
<!-- source: crates/alpha/** -->
The alpha capability SHALL own the alpha crate.

#### Scenario: Alpha ownership
- **WHEN** file ownership is resolved for the alpha crate
- **THEN** system maps `crates/alpha/**` to alpha

### Requirement: Adds Numbers
The system SHALL add two numbers.

#### Scenario: Two plus two
- **WHEN** two and two are added
- **THEN** the sum is four

#### Scenario: Big sums
- **WHEN** two large numbers are added
- **THEN** the sum is their total
