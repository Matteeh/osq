---
title: A sample change for executor prompts
depends_on: []
verify: node verify.cjs
features:
  reads: [beta, " gamma ", beta]
---
## Goal

Give the executor prompt fixture a change with deltas and reads.

## Verify

`node verify.cjs`

## Non-goals

- Anything real.

## Surface

None

## Decisions

None

## Assumptions

None

## Contract

### Requirement: New rule

See `specs/alpha/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/alpha/spec.md`: ADDED, MODIFIED and REMOVED requirements.
- `specs/zeta/spec.md`: a new capability.
