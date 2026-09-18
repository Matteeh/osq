# Spec Delta: Spec Lint and Approve

## Purpose

Governs the human gate: parsing change specifications, validating limits and OpenSpec conventions, computing deterministic SHA-256 folder hashes, and sealing approved changes.

## ADDED Requirements

### Requirement: Change folder structure and parsing
<!-- source: features/spec-lint-and-approve.md # Spec Format & Parsing, tests/parser.test.ts -->
The system SHALL parse change proposals, delta specs, and task definitions.

#### Scenario: Proposal frontmatter extraction
- **WHEN** change folder contains `proposal.md` with YAML frontmatter
- **THEN** system extracts `title`, `depends_on`, and `features.reads`

#### Scenario: Task definition parsing
- **WHEN** task markdown under `tasks/<n>.md` is parsed
- **THEN** system extracts `title`, `verify`, `scope`, `entry`, `skills`, and `acceptance` criteria

### Requirement: Specification lint rules and limits
<!-- source: features/spec-lint-and-approve.md # Lint Rules, tests/linter.test.ts -->
The system SHALL validate change folders against configured operational limits.

#### Scenario: Enforcing limits
- **WHEN** a change folder is linted
- **THEN** system rejects folders exceeding `maxScopeFiles`, chaining verify commands, referencing missing `depends_on`, or exceeding `maxAcceptanceLines`

### Requirement: OpenSpec strict validation integration
<!-- source: tests/linter.test.ts -->
The system SHALL execute OpenSpec CLI validation under strict mode during change linting.

#### Scenario: Pinned validator execution
- **WHEN** `osq lint` or `osq approve` executes
- **THEN** system executes `openspec validate --changes --strict --json --no-interactive` and `openspec validate --specs --strict --json --no-interactive` with `OPENSPEC_TELEMETRY=0` and surfaces findings prefixed with `openspec:`

### Requirement: Deterministic change folder hashing
<!-- source: features/spec-lint-and-approve.md # Folder Hashing, tests/hasher.test.ts -->
The system SHALL compute a deterministic SHA-256 digest of change folder contents.

#### Scenario: Folder hash computation
- **WHEN** `hashChangeFolder` is invoked
- **THEN** files excluding `.run/`, `.git/`, and `.DS_Store` are lexicographically sorted, normalized for line endings and task checkboxes, and hashed with a `sha256:` prefix

### Requirement: Human approval sealing
<!-- source: features/spec-lint-and-approve.md # Approval, tests/approve.test.ts -->
The system SHALL record approval hashes in change folders upon human approval.

#### Scenario: Sealing approved spec
- **WHEN** user executes `osq approve <id>` on a spec passing lint
- **THEN** system writes the computed folder hash to `.run/approved`
