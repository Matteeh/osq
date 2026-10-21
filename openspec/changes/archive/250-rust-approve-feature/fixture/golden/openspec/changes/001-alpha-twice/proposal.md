---
title: Alpha runs twice
depends_on: []
verify: node verify.cjs
features:
  reads: []
---
## Goal

Alpha runs twice instead of once.

## Verify

`node verify.cjs`

The fixture's verify always passes.

## Non-goals

- Running alpha three times.

## Surface

None

## Decisions

None

## Assumptions

None

## Contract

### Requirement: Alpha runs

See `specs/alpha/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/alpha/spec.md`: MODIFIED "Alpha runs".
