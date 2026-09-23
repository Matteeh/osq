---
title: Drop a scenario
depends_on: []
verify: node verify.cjs
features:
  reads: []
---
## Goal

Modify alpha while dropping a scenario.

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

- `specs/alpha/spec.md` modifies Alpha.
