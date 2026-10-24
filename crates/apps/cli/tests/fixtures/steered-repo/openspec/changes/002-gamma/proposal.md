---
title: Gamma joins the fixture
depends_on: []
verify: node verify.cjs
features:
  reads: []
creates: ["gamma"]
---
## Goal

A new gamma capability that owns its own source.

## Verify

`node verify.cjs`

The fixture's verify always passes.

## Non-goals

- Changing alpha.

## Surface

None

## Decisions

None

## Assumptions

None

## Contract

### Requirement: Code ownership

See `specs/gamma/spec.md`.

### Requirement: Gamma greets

See `specs/gamma/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/gamma/spec.md`: ADDED "Code ownership" and "Gamma greets".
