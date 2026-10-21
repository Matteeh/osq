---
title: The sample change modifies alpha, empties beta, creates gamma and replaces epsilon's sidecar
depends_on: []
verify: node verify.cjs
creates:
  - name: gamma
    group: rust
features:
  reads: []
---
## Goal

Exercise every step of the archive.

## Verify

`node verify.cjs`

## Non-goals

None

## Surface

None

## Decisions

None

## Assumptions

None

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/alpha/spec.md`: MODIFIED "Alpha one", RENAMED "Alpha two", ADDED "Alpha three".
- `specs/beta/spec.md`: REMOVED "Beta only".
- `specs/gamma/spec.md`: ADDED "Gamma one".
- `specs/epsilon/osq.yml`: a replacement sidecar.
