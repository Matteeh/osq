## Purpose
The gamma capability of the approve fixture repository greets.

## ADDED Requirements

### Requirement: Code ownership
<!-- source: src/gamma/** -->
The gamma capability SHALL own the gamma source.

#### Scenario: Gamma ownership
- **WHEN** file ownership is resolved for gamma
- **THEN** system maps `src/gamma/**` to gamma

### Requirement: Gamma greets
The system SHALL greet with gamma.

#### Scenario: Gamma says hello
- **WHEN** gamma starts
- **THEN** gamma says hello
