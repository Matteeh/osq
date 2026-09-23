---
title: Create fresh capability
depends_on: []
verify: node verify.cjs
features:
  reads: []
---
## Goal

Introduce a brand new capability.

## Verify

`node verify.cjs`

## Non-goals

- None.

## Contract

### Requirement: Fixture
The fixture SHALL work.

#### Scenario: Fixture runs
- **WHEN** fixture invoked
- **THEN** fixture responds

## Human steps

- Approve.

## Delta

- `specs/fresh/spec.md` creates the capability.
