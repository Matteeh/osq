---
title: Own ADR test checks validity, not a list
depends_on:
  - "084"
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
---
## Goal

Adding a valid ADR to osq's own `decisions/` never breaks a test. The test of
osq's own decision records stops pinning ADR numbers and which ADRs apply to
all. It checks instead that every ADR reads and validates cleanly, and that
AGENTS.md's project rules block matches the accepted system-wide ADRs. In
change 084, committing ADR 003 broke the pinned list, and task 1 blocked twice.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. A new test proves that osq's
own ADRs validate with a current rules block, and that a copy of the decisions
folder with one more valid ADR, and its rules block refreshed, passes the same
checks.

## Non-goals

- Changing how ADRs are read, validated, or rendered.
- Changing any ADR or AGENTS.md.
- Checking osq's own ADR bodies.

## Surface

None

## Decisions

- ADR 001: no config loading changes.
- ADR 004: the change adds no validator call.
- ADR 005: no version check moves.

## Background

`tests/decisions-read.test.ts` holds the "osq's own decision records" test,
which asserted ADRs `001, 002, 004, 005` and no system-wide ADR. Its expected
list was edited by hand to add `003` and `systemWideAdrs` to `['003']` while
084 ran. The living requirement still names four ADRs and says none applies to
all, so it is replaced rather than modified. `checkProjectRules` in
`src/core/foundation/rules-block.ts` already reports a missing, stale, or
unexpected rules block and too many rules, and `osq doctor` uses it.

## Contract

### Requirement: Adding an ADR breaks no pinned list
Adding a valid accepted ADR to osq's `decisions/` and refreshing AGENTS.md
through `osq init` SHALL leave the own-decision-records test green.

#### Scenario: One more ADR
- **WHEN** a copy of osq's decisions folder and AGENTS.md gains a valid accepted ADR and its rules block is refreshed
- **THEN** the own-decision-records checks report no error and no warning

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: removes "osq's own decision records" and adds
  "osq's own decision records validate".

One task.
