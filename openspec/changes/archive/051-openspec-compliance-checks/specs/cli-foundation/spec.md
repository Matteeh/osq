# Spec Delta: CLI Foundation

## MODIFIED Requirements

### Requirement: Repository health diagnostics
<!-- source: src/cli/doctor.ts, src/core/foundation/doctor.ts, src/core/foundation/config*.ts, tests/doctor.test.ts, tests/openspec-version.test.ts -->
The CLI SHALL provide a doctor command that validates configuration, harness binary availability, managed blocks, lock states, archive integrity, and the OpenSpec validator. A check MAY pass with a warning; doctor prints it as `[warn]` and it does not change the exit code.

#### Scenario: Doctor passes on healthy repository
- **WHEN** user executes `osq doctor` in a properly configured repository with the pinned validator
- **THEN** command prints one status line per check (`config`, `harness`, `managed-blocks`, `locks`, `archives`, `validator`) and exits with code 0

#### Scenario: Doctor fails on check violation
- **WHEN** any diagnostic check fails (invalid config, missing harness binary, drift in managed blocks, orphaned locks, invalid archives, or a validator outside the peer range)
- **THEN** command reports the failed check line and exits with code 1

#### Scenario: Doctor fails on validator drift
- **WHEN** the installed OpenSpec validator version lies outside the `peerDependencies` range declared in osq's `package.json`
- **THEN** command reports a failing `validator` line describing version drift and exits with code 1

#### Scenario: Doctor warns on a compatible validator
- **WHEN** the installed OpenSpec validator version differs from the pinned version but lies inside the declared peer range
- **THEN** command prints a `[warn] validator:` line naming the version and the range, and exits with code 0

#### Scenario: Doctor rejects an incomplete gate configuration
- **WHEN** the resolved configuration lacks a boolean `gates.changeVerifyAfterTask`
- **THEN** the doctor config check fails as invalid or incomplete

## ADDED Requirements

### Requirement: One proposal format
<!-- source: templates/proposal.md, templates/openspec/schemas/osq/templates/proposal.md, templates/openspec/schemas/osq/schema.yaml, templates/openspec/config.yaml, tests/proposal-format.test.ts -->
The osq schema's proposal template SHALL be byte-identical to
`templates/proposal.md`, the template `osq new` writes. The schema's proposal
instruction and the proposal rules in `templates/openspec/config.yaml` SHALL
name the sections Goal, Verify, Non-goals, Contract, Human steps, and Delta in
that order, the frontmatter `verify` command, and `features.reads`, and SHALL
NOT ask for Why, What Changes, Capabilities, or Impact sections.

#### Scenario: Both proposal entry points agree
- **WHEN** the schema's proposal template and `templates/proposal.md` are compared
- **THEN** they are byte-identical

#### Scenario: Instruction matches the planner
- **WHEN** the schema's proposal instruction and the managed `PLANNER.md` block are inspected
- **THEN** both name `## Goal`, `## Non-goals`, and `## Human steps`, and the instruction contains no `What Changes` or `Capabilities` section

### Requirement: Repository runs the scaffolded OpenSpec schema
<!-- source: openspec/config.yaml, openspec/schemas/osq/**, tests/proposal-format.test.ts -->
The osq repository SHALL carry `openspec/config.yaml` and
`openspec/schemas/osq/**` byte-identical to the files under
`templates/openspec/` that `osq init` scaffolds, so the repository's own
changes and living specs validate under the schema users get.

#### Scenario: Dogfood copy stays current
- **WHEN** the repository's `openspec/config.yaml` and `openspec/schemas/osq/` files are compared with `templates/openspec/`
- **THEN** both sides hold the same file set and every file is byte-identical
