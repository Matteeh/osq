---
title: Bare rename
depends_on: []
verify: node verify.cjs
features:
  reads: []
---
## Goal

Rename with the bare form OpenSpec skips.

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

- `specs/alpha/spec.md` renames Alpha and adds Gamma.
