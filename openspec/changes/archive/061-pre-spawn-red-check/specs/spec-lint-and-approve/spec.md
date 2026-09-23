# Spec Delta: Spec Lint and Approve

## MODIFIED Requirements

### Requirement: Change folder structure and parsing
<!-- source: features/spec-lint-and-approve.md # Spec Format & Parsing, tests/parser.test.ts, tests/pre-spawn-config.test.ts -->
The system SHALL parse change proposals, delta specs, and task definitions.

#### Scenario: Proposal frontmatter extraction
- **WHEN** change folder contains `proposal.md` with YAML frontmatter
- **THEN** system extracts `title`, `depends_on`, and `features.reads`

#### Scenario: Task definition parsing
- **WHEN** task markdown under `tasks/<n>.md` is parsed
- **THEN** system extracts `title`, `verify`, `scope`, `entry`, `skills`, `verify_starts`, and `acceptance` criteria

#### Scenario: Task start state
- **WHEN** task frontmatter declares `verify_starts` as `green` or `any`
- **THEN** the parsed task carries that start state, and an absent or unrecognized value parses as `red`
