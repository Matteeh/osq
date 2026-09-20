# spec-lint-and-approve Specification

## Purpose

Governs the human gate: parsing change specifications, validating limits and OpenSpec conventions, computing deterministic SHA-256 folder hashes, and sealing approved changes.

## Requirements

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

### Requirement: Code ownership
<!-- source: src/core/parser.ts, src/core/linter.ts, src/core/approve.ts, src/core/hasher.ts, src/core/delta.ts, src/core/migrate.ts, src/cli/lint.ts, src/cli/migrate.ts -->
The Spec Lint and Approve capability SHALL own specification parsing, linting, approval sealing, hashing, and migration logic.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for spec validation and parsing
- **THEN** system maps `src/core/parser.ts`, `src/core/linter.ts`, `src/core/approve.ts`, `src/core/hasher.ts`, `src/core/delta.ts`, `src/core/migrate.ts`, `src/cli/lint.ts`, and `src/cli/migrate.ts` to `spec-lint-and-approve`

### Requirement: Capability code ownership parsing
<!-- source: src/core/parser.ts, tests/parser.test.ts -->
The system SHALL parse `### Requirement: Code ownership` blocks by header name across living and delta specifications.

#### Scenario: Parsing ownership globs from header
- **WHEN** parser inspects any capability specification containing `### Requirement: Code ownership`
- **THEN** system extracts the declared glob list and associates it with the capability

### Requirement: Test modification declaration validation
<!-- source: src/core/linter.ts, tests/linter.test.ts -->
The linter SHALL validate that tasks altering existing tests explicitly declare `tests.modify: true`.

#### Scenario: Valid test modification declaration
- **WHEN** task frontmatter declares `tests.modify: true` as a boolean
- **THEN** linter accepts the declaration and permits test file paths in task scope

#### Scenario: Invalid test modification type
- **WHEN** task frontmatter provides a non-boolean value for `tests.modify`
- **THEN** linter rejects the task with a schema validation error

### Requirement: Architecture Decision Record 004: Pinned OpenSpec Validator
<!-- source: decisions/004-pinned-openspec-validator.md, decisions/README.md -->
The project SHALL record and accept ADR 004 documenting the pinned `@fission-ai/openspec` dependency, exact version pin, validator execution semantics, and drift diagnostics.

#### Scenario: ADR 004 acceptance and indexing
- **WHEN** decisions in the repository are inspected
- **THEN** `decisions/004-pinned-openspec-validator.md` is present and indexed in `decisions/README.md` as accepted before approval

### Requirement: OpenSpec schema execution authority instructions
<!-- source: templates/openspec/schemas/osq/schema.yaml, templates/openspec/config.yaml, templates/openspec/schemas/osq/README.md -->
The OpenSpec schema template SHALL instruct agents that tasks are executed solely by `osq watch`, archiving is owned exclusively by `osq`, and task checkboxes are runner-written projections.

#### Scenario: Schema instructions enforce execution authority
- **WHEN** an agent reads schema instructions for tasks or apply actions
- **THEN** instructions explicitly prohibit direct task execution or `openspec archive`, delegating execution exclusively to `osq watch`

### Requirement: Proposal change-level verify command declaration
<!-- source: src/core/parser.ts, src/core/linter.ts, tests/linter.test.ts -->
The linter and parser SHALL require that change proposals declare an executable change-level `verify` command in YAML frontmatter.

#### Scenario: Linter requires verify command on proposal
- **WHEN** `proposal.md` lacks a `verify` frontmatter field or provides an empty string
- **THEN** `osq lint` rejects the change folder with a validation error

#### Scenario: Linter accepts valid verify command
- **WHEN** `proposal.md` declares a non-empty `verify` string command in frontmatter
- **THEN** `osq lint` accepts the proposal structure

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

### Requirement: Prohibited control characters rejection
<!-- source: src/core/linter.ts, tests/mangled-lint.test.ts -->
The linter and approval engine SHALL inspect all files in a change folder and reject any file containing prohibited ASCII control characters (0x00-0x1F and 0x7F) other than newline (`\n`, 0x0A) and tab (`\t`, 0x09).

#### Scenario: Control characters trigger lint and approval failure
- **WHEN** any file in a change folder contains prohibited control characters (e.g. `\x07` bell or `\x08` backspace)
- **THEN** `osq lint` and `osq approve` fail reporting an error identifying the file and character

#### Scenario: Allowed whitespace passes
- **WHEN** files contain only valid printable characters, newlines (`\n`), and tabs (`\t`)
- **THEN** control character validation passes

### Requirement: Fused acceptance lines rejection
<!-- source: src/core/linter.ts, tests/mangled-lint.test.ts -->
The linter SHALL reject any task file where two or more acceptance checkbox checklist items appear on the same line.

#### Scenario: Fused acceptance lines trigger lint error
- **WHEN** a line in a task file contains more than one acceptance checkbox pattern (`[-*]\s*\[[ xX]\]`)
- **THEN** `osq lint` and `osq approve` reject the task file reporting fused acceptance lines

#### Scenario: Separate acceptance lines pass
- **WHEN** every acceptance checklist item appears on its own line
- **THEN** acceptance line structure validation passes

### Requirement: Dead marker retention and renaming on approval
<!-- source: src/core/approve.ts, tests/dead-marker-retention.test.ts -->
When `osq approve` is executed on a change folder containing active dead markers (`.run/dead/<n>.md`), the approval engine SHALL rename each dead marker to `.run/dead/<n>.<attempt>.md`, where `<attempt>` is derived from existing attempts, preserving prior failure diagnostics.

#### Scenario: First failure preserved on re-approval
- **WHEN** `osq approve` runs on a change containing `.run/dead/1.md` without prior attempt markers
- **THEN** `dead/1.md` is renamed to `dead/1.1.md`

#### Scenario: Subsequent failures increment attempt number
- **WHEN** `osq approve` runs on a change containing `.run/dead/1.md` and existing `dead/1.1.md`
- **THEN** `dead/1.md` is renamed to `dead/1.2.md`

### Requirement: Task title phrasing permissiveness
<!-- source: src/core/linter.ts, tests/linter.test.ts -->
The linter SHALL permit task titles containing " and " without emitting a warning.

#### Scenario: Task title containing and emits no warning
- **WHEN** a task declares a title containing " and "
- **THEN** `osq lint` produces zero warnings for the title

### Requirement: Instruction-shaped delta rejection in linter
<!-- source: src/core/linter.ts, tests/instruction-delta-lint.test.ts -->
The linter SHALL inspect delta specifications under `specs/` in change folders and reject any requirement whose name or heading is instruction-shaped (such as starting with "update" or "document").

#### Scenario: Linter rejects requirement starting with update or document
- **WHEN** a delta specification contains a requirement starting with "update" or "document" (case-insensitive)
- **THEN** `osq lint` and `osq approve` reject the change folder with a validation error

#### Scenario: Declarative capability deltas pass lint
- **WHEN** all delta specifications declare behavior using declarative requirements
- **THEN** instruction-shaped delta validation passes with zero errors
