# Spec Delta: Spec Lint and Approve

## ADDED Requirements

### Requirement: Pinned OpenSpec validator failure gating
<!-- source: src/core/linter.ts, src/core/approve.ts, tests/validator-missing.test.ts, tests/no-skipped-in-src.test.ts -->
The linter and approval engine SHALL require that `@fission-ai/openspec` is installed and matches the pinned version `1.13.1`. If the binary is missing or the version differs from `1.13.1`, `osq lint` and `osq approve` SHALL fail with exit code 1, reporting an error citing ADR 004 and the install command `pnpm add -D @fission-ai/openspec@1.13.1`. Zero checks report skipped, and the word "skipped" SHALL NOT appear in `src/`.

#### Scenario: Missing validator binary causes lint and approval failure
- **WHEN** `node_modules/.bin/openspec` is missing or unavailable
- **THEN** `osq lint` and `osq approve` fail reporting an error citing ADR 004 and `pnpm add -D @fission-ai/openspec@1.13.1`

#### Scenario: Version drift causes lint and approval failure
- **WHEN** `openspec` reports a version differing from `1.13.1`
- **THEN** `osq lint` and `osq approve` fail reporting version drift citing ADR 004 and `pnpm add -D @fission-ai/openspec@1.13.1`

#### Scenario: Zero checks report skipped and word absent from src
- **WHEN** validation and diagnostic checks execute across the project
- **THEN** no check reports a skipped status and `grep -ri "skipped" src/` finds zero matches

### Requirement: Proposal schema writes rejection
<!-- source: src/core/parser.ts, src/core/linter.ts, templates/openspec/schemas/osq/schema.yaml, tests/proposal-writes-schema.test.ts -->
The parser and linter SHALL reject any change proposal declaring `features.writes` in YAML frontmatter. Capability writes SHALL be derived exclusively from the set of delta specification files under `specs/<capability>/spec.md`.

#### Scenario: Linter rejects proposal with features.writes
- **WHEN** `proposal.md` declares `features.writes` in YAML frontmatter
- **THEN** `osq lint` rejects the change folder with a validation error

#### Scenario: Delta specifications serve as sole writes declaration
- **WHEN** a change folder declares delta specification files under `specs/`
- **THEN** system derives written capabilities exclusively from the present delta files without frontmatter declaration