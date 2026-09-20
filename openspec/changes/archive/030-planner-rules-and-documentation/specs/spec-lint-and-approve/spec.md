# Spec Delta: Specification Lint and Approval Gate

## ADDED Requirements

### Requirement: Instruction-shaped delta rejection in linter
<!-- source: src/core/linter.ts, tests/instruction-delta-lint.test.ts -->
The linter SHALL inspect delta specifications under `specs/` in change folders and reject any requirement whose name or heading is instruction-shaped (such as starting with "update" or "document").

#### Scenario: Linter rejects requirement starting with update or document
- **WHEN** a delta specification contains a requirement starting with "update" or "document" (case-insensitive)
- **THEN** `osq lint` and `osq approve` reject the change folder with a validation error

#### Scenario: Declarative capability deltas pass lint
- **WHEN** all delta specifications declare behavior using declarative requirements
- **THEN** instruction-shaped delta validation passes with zero errors
