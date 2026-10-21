# alpha Specification

## Purpose
The alpha capability of the approve fixture repository.

## Requirements

### Requirement: Code ownership
<!-- source: src/alpha/** -->
The alpha capability SHALL own the alpha source.

#### Scenario: Alpha ownership
- **WHEN** file ownership is resolved for alpha
- **THEN** system maps `src/alpha/**` to alpha

### Requirement: Alpha runs
The system SHALL run alpha once.

#### Scenario: Alpha runs once
- **WHEN** alpha starts
- **THEN** alpha runs once
