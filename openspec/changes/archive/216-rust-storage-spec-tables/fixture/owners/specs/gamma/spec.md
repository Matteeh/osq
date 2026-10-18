# gamma Specification

## Purpose

Gamma shares one file with beta.

## Requirements

### Requirement: Code ownership
<!-- source: src/shared.ts -->
The gamma capability SHALL own `src/shared.ts`.

#### Scenario: Gamma ownership
- **WHEN** file ownership is resolved
- **THEN** system maps `src/shared.ts` to gamma
