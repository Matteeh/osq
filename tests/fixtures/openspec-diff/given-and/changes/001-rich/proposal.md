---
title: Add rich requirement
depends_on: []
verify: node verify.cjs
features:
  reads: []
---
## Goal

Add a requirement with extra scenario bullets.

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

- `specs/alpha/spec.md` adds Rich.
