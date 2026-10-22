---
title: Beta prints the count
depends_on: []
verify: node --test tests/beta.test.ts
features:
  reads: [alpha]
---
## Goal

Beta prints alpha's count.

## Verify

`node --test tests/beta.test.ts`.

## Non-goals

- Formatting.

## Contract

### Requirement: Beta prints
Beta SHALL print the count.

#### Scenario: Beta prints
- **WHEN** beta runs
- **THEN** it prints the count

## Human steps

### Before approval

None

### After landing

None
