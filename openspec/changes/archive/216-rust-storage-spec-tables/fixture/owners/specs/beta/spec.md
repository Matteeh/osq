# beta Specification

## Purpose

Beta owns its folder and a shared file.

## Requirements

### Requirement: Code ownership
<!-- source: src/beta/**, src/shared.ts -->
The beta capability SHALL own `src/beta/**` and `src/shared.ts`.

#### Scenario: Beta ownership
- **WHEN** file ownership is resolved
- **THEN** system maps `src/beta/**` and `src/shared.ts` to beta
