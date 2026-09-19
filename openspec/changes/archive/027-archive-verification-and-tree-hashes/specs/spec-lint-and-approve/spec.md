## ADDED Requirements

### Requirement: Proposal change-level verify command declaration
<!-- source: src/core/parser.ts, src/core/linter.ts, tests/linter.test.ts -->
The linter and parser SHALL require that change proposals declare an executable change-level `verify` command in YAML frontmatter.

#### Scenario: Linter requires verify command on proposal
- **WHEN** `proposal.md` lacks a `verify` frontmatter field or provides an empty string
- **THEN** `osq lint` rejects the change folder with a validation error

#### Scenario: Linter accepts valid verify command
- **WHEN** `proposal.md` declares a non-empty `verify` string command in frontmatter
- **THEN** `osq lint` accepts the proposal structure
