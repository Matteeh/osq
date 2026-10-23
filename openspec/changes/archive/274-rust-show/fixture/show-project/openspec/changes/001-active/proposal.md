---
title: Alpha learns to count
depends_on: []
verify: node --test tests/alpha.test.ts
creates: [gamma]
features:
  reads: [beta]
---
## Goal

Alpha counts its calls. Beta reads the count!
Gamma stores nothing yet.

## Verify

`node --test tests/alpha.test.ts` runs the alpha tests.

## Non-goals

- Persisting the count.

## Surface

None

## Decisions

- ADR 002: alpha writes stay in `src/alpha.ts`.
- Departs from ADR 001: the count test is rewritten while the suite is red.

## Assumptions

None

## Contract

### Requirement: Alpha counts
Alpha SHALL count its calls.

#### Scenario: Alpha counts
- **WHEN** alpha is called twice
- **THEN** its count is two

## Human steps

### Before approval

- Back up the alpha data.

### After landing

- Tell the beta team.
- Remove the backup.

## Delta

- `specs/alpha/spec.md`, `specs/gamma/spec.md` and `specs/alpha-extra/spec.md`.
