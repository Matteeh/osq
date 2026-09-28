---
title: ADR 006 records that osq is the deterministic core, and its rule reaches every agent
depends_on: []
verify: pnpm verify
features:
  reads: []
---
## Goal

osq's direction, agreed on 2026-09-28, becomes an accepted decision in the
repository: osq does every deterministic step, AI does the judgement inside
osq's gates, and a human only steers plans or taps decisions. ADR 006 records
it, the decisions index lists it, and its one-line rule reaches every planner
and executor through the project rules block in AGENTS.md. Every later brief
in the queue is checked against it.

## Verify

`pnpm verify`

The typechecks, build, full suite and lint pass. `osq lint` and `osq doctor`
run `checkProjectRules`, so a stale rules block or an invalid ADR fails them,
and `tests/decisions-own.test.ts` and `tests/doctor.test.ts` check osq's own
decisions folder and AGENTS.md. The new `tests/adr-006.test.ts` checks ADR 006
itself, its rule in AGENTS.md, and the index.

## Non-goals

- Changing ADR 003. Each later change revises the part of ADR 003 it
  implements, as ADR 006's "Consequences for ADR 003" says.
- Any code change.
- Pinning ADR 006 in `tests/decisions-own.test.ts`. That test stays free of
  ADR numbers, as cli-foundation requires.
- Renumbering or accepting the confinement ADR drafted in Notion. That belongs
  to `confinement-env`.

## Surface

- Added: ADR 006, `decisions/006-deterministic-core.md` (document)
- Changed: AGENTS.md's `## Project rules` block gains ADR 006's rule
- Changed: the index in `decisions/README.md` lists ADR 003 and ADR 006

## Decisions

- ADR 001: unchanged; nothing here loads config.
- ADR 004: unchanged; nothing here runs the OpenSpec validator.
- ADR 005: unchanged; nothing here checks the validator range.

## Background

**The rule is shorter than the brief's draft.** The brief's rule is 171
characters, and `limits.maxRuleLength` is 160. Measured on 2026-09-28 in a
scratch copy of the repository, the draft rule fails
`tests/decisions-own.test.ts` and `tests/doctor.test.ts` with "rule is longer
than limits.maxRuleLength (160)". The accepted rule reads "osq does every
deterministic step, AI does judgement inside osq's gates, and a human only
steers plans or taps decisions; a gate blocks or is removed." It is 150
characters and keeps the draft's meaning. With it, the whole suite gives the
same result as before the change, so no existing test changes.

**One file, two names.** `CLAUDE.md` is a symlink to `AGENTS.md`, so the rules
block reaches Claude Code sessions as well.

**The index was already missing ADR 003.** `decisions/README.md` lists 001,
002, 004 and 005. The change adds 003 as well as 006, and the cli-foundation
delta adds "osq's decisions index is complete", so the next ADR can't be
left out. Like "osq's own decision records validate", its test names no ADR
number.

**Why a delta.** AGENTS.md belongs to cli-foundation, and `osq lint` requires
every change to carry a delta. The delta adds a rule about the index, which
is what was actually broken,
instead of a requirement that names ADR 006. It leaves "osq's own decision
records validate" as it is.

## Contract

### Requirement: ADR 006 is accepted
`decisions/006-deterministic-core.md` SHALL be an accepted, system-wide ADR
whose rule is "osq does every deterministic step, AI does judgement inside
osq's gates, and a human only steers plans or taps decisions; a gate blocks or
is removed."

#### Scenario: Reading osq's decisions
- **WHEN** `readDecisions` reads the repository's decisions folder
- **THEN** ADR 006 is listed with status `accepted`, `applies_to` `all`, and that rule, and `validateDecisions` reports no error or warning

### Requirement: The rule reaches every agent
AGENTS.md's project rules block SHALL be exactly what `renderRulesBlock`
renders for the repository's decisions: ADR 003's rule, then ADR 006's.

#### Scenario: Project rules check
- **WHEN** `checkProjectRules` runs on the repository
- **THEN** it reports nothing, and the block holds the line for ADR 006

### Requirement: The index lists every ADR
The index in `decisions/README.md` SHALL link every ADR file in `decisions/`
exactly once, as the cli-foundation delta's added "osq's decisions index is
complete" says.

#### Scenario: Index after the change
- **WHEN** the index is read
- **THEN** it links the files of ADRs 001 to 006, each once

### Requirement: Existing behaviour is unchanged
No command or config key SHALL change.

#### Scenario: Existing suites
- **WHEN** the existing suite runs
- **THEN** every existing test passes unchanged

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: adds "osq's decisions index is complete".

One task. No file is shared between tasks.
