# alpha Specification

## Purpose
The alpha capability of the link gates fixture.

## Requirements

### Requirement: Code ownership
<!-- source: crates/alpha/** -->
The alpha capability SHALL own the alpha crate.

#### Scenario: Alpha ownership
- **WHEN** file ownership is resolved for the alpha crate
- **THEN** system maps `crates/alpha/**` to alpha

### Requirement: Adds numbers
The system SHALL add two numbers.

#### Scenario: Two plus two
- **WHEN** two and two are added
- **THEN** the sum is four
