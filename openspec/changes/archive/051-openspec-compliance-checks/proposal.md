---
title: OpenSpec compliance checks
depends_on:
  - '050'
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - watcher-and-harness
---
## Goal

Make OpenSpec compliance something CI checks instead of something we remember.
Compliance means OpenSpec's CLI validates and archives osq changes exactly as
osq does. It does not mean adopting every new OpenSpec feature.

Replaying changes 045 to 047 through `openspec archive` 1.13.1 gives the same
living specs as osq's own merge, but only because those changes use few delta
shapes. Scratch runs against 1.13.1 found six divergences in
`src/core/spec/delta.ts`:

- OpenSpec's documented RENAMED form, ``- FROM: `### Requirement: X` ``, fails
  in osq with "not found in base spec".
- osq's bare RENAMED form, ``- FROM: `X` ``, renames in osq. OpenSpec archives
  it without renaming anything.
- A MODIFIED block that leaves out an existing scenario is refused by OpenSpec.
  osq replaces the block and drops the scenario.
- An ADDED requirement whose name already exists is refused by OpenSpec. osq
  adds a duplicate.
- A new capability's `## Purpose` heading is followed directly by its text in
  OpenSpec and by a blank line in osq. On later merges OpenSpec keeps the base
  bytes, and osq rewrites them.
- A scenario's `**GIVEN**` and `**AND**` bullets and any other lines survive in
  OpenSpec. osq keeps only the WHEN and THEN bullets.

The existing equivalence test replays osq's merge against itself, so none of
this shows up. This change fixes the merge and adds a differential test against
the pinned `openspec archive`. It also adds a weekly CI job that runs the same
test against `@latest`.

ADR 004's exact pin makes `osq doctor`, `osq lint`, and `osq approve` fail for
anyone who installs OpenSpec `@latest`, as OpenSpec itself recommends. Inside
the declared peer range, a version that differs from the pin becomes a warning.

osq also has two proposal formats. The schema that `osq init` scaffolds tells
OpenSpec-aware agents to write Why, What Changes, Capabilities, and Impact,
while `osq new` and `PLANNER.md` use Goal, Verify, Non-goals, Contract, Human
steps, and Delta. osq's sections win. osq's parser, linter, planner, and every
change so far use them. OpenSpec validates only delta specs, and custom schema
templates are OpenSpec's supported extension point. This repository then carries
the same `openspec/config.yaml` and schema that users get, so its own changes
validate under that schema.

## Verify

`pnpm verify`

The suite runs the differential test offline against the installed pinned
validator. It compares osq's merge with `openspec archive` for every fixture
case and checks that both refuse the same deltas. It also covers the version
classification in doctor and lint, the single proposal format, the repository's
byte-equal copy of the scaffolded schema, and the structure of the scheduled
workflow. It needs no network service, TTY, or real model.

## Non-goals

- Changing the pinned version or the peer range.
- Adopting new OpenSpec workflow commands.
- Renaming archive folders. osq keeps `archive/<id>-<slug>`, while
  `openspec archive` writes `archive/<date>-<id>-<slug>`. The differential test
  compares living specs only.
- Aligning the task-list format. The schema's `tasks.md` example numbers tasks
  `1.1`, and osq numbers them `1.`.
- Making `applyOpenSpecDeltas` all-or-nothing across capabilities. The lint dry
  run already refuses such a change before approval.
- Detecting a stale scaffolded schema in consumer projects.

## Contract

### Requirement: OpenSpec merge parity

osq's delta merge SHALL produce byte-identical living specs to
`openspec archive` for every delta that `openspec archive` accepts, and SHALL
refuse every delta that `openspec archive` refuses. osq SHALL refuse a
RENAMED entry that does not use the `### Requirement:` form, instead of
skipping it silently.

#### Scenario: Accepted delta
- **WHEN** a fixture change is merged by both tools
- **THEN** the living spec trees are byte-identical

#### Scenario: Refused delta
- **WHEN** a MODIFIED block leaves out a scenario, or an ADDED name already exists
- **THEN** both tools refuse the change and leave the living specs unchanged

### Requirement: Scheduled upstream check

A scheduled CI workflow SHALL run the differential test against
`@fission-ai/openspec@latest` and SHALL name the upstream version when it fails.

#### Scenario: Upstream diverges
- **WHEN** the latest OpenSpec merges a fixture differently from osq
- **THEN** the workflow fails and its output names that OpenSpec version

### Requirement: Validator version policy

Doctor and lint SHALL accept the pinned version, warn without failing on a
different version inside the declared peer range, and fail outside it.

#### Scenario: Newer compatible validator
- **WHEN** the installed validator is inside the peer range but differs from the pin
- **THEN** `osq doctor` prints a `[warn]` validator line and exits 0, and `osq lint` reports a warning and passes

### Requirement: One proposal format

The osq schema's proposal template SHALL equal the template `osq new` writes, and
the schema's proposal instruction and rules SHALL name the same sections as
`PLANNER.md`.

#### Scenario: OpenSpec-aware agent starts a proposal
- **WHEN** an agent reads the osq schema's proposal template and instruction
- **THEN** it is told to write Goal, Verify, Non-goals, Contract, Human steps, and Delta

## Human steps

- Review the proposal, both deltas, and the four task bodies, then run
  `pnpm osq approve 051` yourself.
- After task 4 lands and is pushed, trigger the `OpenSpec latest` workflow once
  with `workflow_dispatch` and check that it passes. It needs the network, which
  no task has.
- In each consumer project, `osq init` never overwrites the scaffolded schema,
  so the old Why/What Changes template stays there. To migrate, delete
  `openspec/config.yaml` and `openspec/schemas/osq/` and run `osq init` again.

## Delta

- `specs/spec-lint-and-approve/spec.md` adds `OpenSpec merge parity`,
  `Differential archive test`, `Scheduled upstream OpenSpec check`, and
  `Architecture Decision Record 005: OpenSpec validator peer range`, and
  modifies `Pinned OpenSpec validator failure gating`.
- `specs/cli-foundation/spec.md` modifies `Repository health diagnostics` and
  adds `One proposal format` and `Repository runs the scaffolded OpenSpec
  schema`.

Task 1 owns the merge and the differential test. Task 2 owns version
classification, doctor, lint, and ADR 005. Task 3 owns the proposal format and
the repository's schema copy. Task 4 owns the workflow. No file belongs to two
tasks. Task 3 runs the differential test in its verify, because that test
validates fixture changes under the schema task 3 rewrites. Task 4 runs the test
through the `OSQ_OPENSPEC_BIN` variable that task 1 adds.
