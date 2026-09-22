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
<!-- source: src/core/linter.ts, tests/plan-prompt-lifecycle.test.ts -->
The linter SHALL validate authored change artifacts and configured limits while
treating root-level `plan-prompt.md` as transient local planning context. It
SHALL exclude that file from schema, artifact, and tree inputs exactly as it
excludes `.run/`, without weakening validation of any proposal, delta, task, or
other authored file.

#### Scenario: Enforcing limits
- **WHEN** a change folder is linted
- **THEN** declared scope-pattern, acceptance-line, contract-table, and other configured limits remain enforced while resolved overlap remains a warning

#### Scenario: Change contains a planning prompt
- **WHEN** an otherwise valid change is linted with any `plan-prompt.md` bytes
- **THEN** lint returns the same findings as it would if that transient file were absent

### Requirement: OpenSpec strict validation integration
<!-- source: tests/linter.test.ts -->
The system SHALL execute OpenSpec CLI validation under strict mode during change linting.

#### Scenario: Pinned validator execution
- **WHEN** `osq lint` or `osq approve` executes
- **THEN** system executes `openspec validate --changes --strict --json --no-interactive` and `openspec validate --specs --strict --json --no-interactive` with `OPENSPEC_TELEMETRY=0` and surfaces findings prefixed with `openspec:`

### Requirement: Deterministic change folder hashing
<!-- source: src/core/hasher.ts, tests/hasher.test.ts, tests/plan-prompt-lifecycle.test.ts -->
The system SHALL compute deterministic SHA-256 hashes over change-folder files
while excluding `.run/`, `.git`, `.DS_Store`, and root-level
`plan-prompt.md`, and while normalizing task checklist state and line endings.
Approval, pre-spawn conflict checks, retry integrity, and archive tree
verification SHALL consume the same exclusion contract.

#### Scenario: Folder hash computation
- **WHEN** `hashChangeFolder` is invoked
- **THEN** covered files excluding `.run/`, `.git/`, `.DS_Store`, and root `plan-prompt.md` are sorted, normalized, and hashed with a `sha256:` prefix

#### Scenario: Transient prompt changes
- **WHEN** `plan-prompt.md` is added, edited, or removed after a change hash is computed
- **THEN** every integrity consumer observes the same unchanged hash

#### Scenario: Authored artifact changes
- **WHEN** any covered proposal, task, delta, or brief byte changes
- **THEN** the deterministic folder hash changes and existing integrity gates detect the drift

### Requirement: Human approval sealing
<!-- source: src/core/approve.ts, src/cli/approve.ts, src/core/planning.ts, tests/planning-observed.test.ts -->
Before writing the approval seal and manifest, `osq approve` SHALL discover and
append deduplicated local planning sessions whose observed file-edit tool calls
target the selected change during its creation-to-approval window. Reader
absence, malformed local data, and no matches SHALL not weaken lint or prevent
approval. When no reader matches, approval SHALL print one line stating that no
planning record was found.

#### Scenario: Sealing approved spec
- **WHEN** a user executes `osq approve <id>` on a change passing lint
- **THEN** observation runs, the manifest is built from recorded history, and the authored-content hash is written to `.run/approved`

#### Scenario: Approval observes matching planning
- **WHEN** a local supported-tool session edited the selected change in the observation window
- **THEN** its observed record is appended before the manifest is built and the approval seal covers only authored artifacts

#### Scenario: Approval observes no planning
- **WHEN** no supported local session matches the change and window
- **THEN** approval succeeds with null planner attribution and prints the one-line notice

### Requirement: Code ownership
<!-- source: src/core/spec/**, src/cli/lint.ts, src/cli/migrate.ts -->
The Spec Lint and Approve capability SHALL own specification parsing, linting,
approval sealing without failure-state transitions, hashing, dependency
existence validation, and migration logic.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for spec validation and parsing
- **THEN** system maps `src/core/spec/**`, `src/cli/lint.ts`, and `src/cli/migrate.ts` to `spec-lint-and-approve`

### Requirement: Capability code ownership parsing
<!-- source: src/core/parser.ts, tests/parser.test.ts -->
The system SHALL parse `### Requirement: Code ownership` blocks by header name across living and delta specifications.

#### Scenario: Parsing ownership globs from header
- **WHEN** parser inspects any capability specification containing `### Requirement: Code ownership`
- **THEN** system extracts the declared glob list and associates it with the capability

### Requirement: Test modification declaration validation
<!-- source: src/core/scope.ts, src/core/linter.ts, tests/linter.test.ts, tests/scope-lint.test.ts -->
The linter SHALL validate that tasks altering existing tests explicitly declare
`tests.modify: true`. It SHALL identify existing test files through the shared
deterministic scope resolver without maintaining another glob matcher or tree
walker.

#### Scenario: Valid test modification declaration
- **WHEN** task frontmatter declares `tests.modify: true` as a boolean
- **THEN** linter accepts the declaration and permits exact or glob-resolved existing test paths in task scope

#### Scenario: Existing test lacks declaration
- **WHEN** an exact path or glob resolves to an existing test file and `tests.modify` is false
- **THEN** linter rejects the task and identifies the resolved test file

#### Scenario: New exact test path
- **WHEN** task scope names an exact test path that does not yet exist
- **THEN** lint does not treat that null resolver entry as modification of an existing test

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

### Requirement: Retry approval integrity
<!-- source: src/core/retry.ts, src/core/approve.ts, src/core/hasher.ts, tests/retry.test.ts, tests/dead-marker-retention.test.ts -->
The retry transition SHALL compare the current deterministic change-folder hash
with `.run/approved` before changing any marker or appending an event. A missing
or mismatched approval SHALL leave failure state intact and identify
`osq approve <id>` as the remediation. Approval SHALL update approval artifacts
without renaming an active dead or regressed marker; only retry may retire one.

#### Scenario: Retry matches approval
- **WHEN** an active failed change still matches its approved hash
- **THEN** retry may proceed without changing the approval marker

#### Scenario: Retry finds authored drift
- **WHEN** authored change-folder content no longer matches `.run/approved`
- **THEN** retry refuses before mutation and directs the user to approve the change again

#### Scenario: Reapproval retains active failure
- **WHEN** `osq approve` seals a change that still has an active dead or regressed marker
- **THEN** approval leaves that marker active for an explicit retry or rejection decision

### Requirement: Rejected dependency existence
<!-- source: src/core/linter.ts, src/core/layout.ts, tests/linter.test.ts -->
Dependency validation SHALL recognize a referenced change retained in the
canonical rejected directory as an existing historical change. Existence SHALL
NOT imply that the dependency landed.

#### Scenario: Linting a rejected dependency reference
- **WHEN** a proposal names a dependency whose folder exists only under `openspec/changes/rejected/`
- **THEN** lint does not report the dependency identifier as missing

### Requirement: Verify-command trust validation
<!-- source: src/core/linter.ts, tests/linter.test.ts -->
The linter SHALL analyze the proposal verify command and every task verify
command without executing or shell-expanding them. The template sentinel
`node -e "process.exit(0)"` and normalized equivalents SHALL be errors. A
recognized package-script invocation naming no script in the project-root
`package.json` SHALL be an error. Any other command that names neither an
existing repository-relative path nor a recognized package script SHALL emit a
warning.

Sentinel normalization SHALL cover surrounding and repeated ASCII whitespace,
single or double quotes around `process.exit(0)`, `-e` and `--eval`, and an
optional semicolon inside the JavaScript expression. Package-script recognition
SHALL cover ordinary pnpm, npm, yarn, and bun direct or `run` forms. A missing
or malformed package manifest SHALL be handled deterministically without
executing the command.

#### Scenario: Placeholder verify is rejected
- **WHEN** a proposal or task verify is the template sentinel or a normalized equivalent
- **THEN** lint fails with an actionable diagnostic requiring real final-tree verification

#### Scenario: Referenced package script is missing
- **WHEN** a recognized package-manager command names a script absent from the root manifest
- **THEN** lint fails and identifies the missing script and artifact

#### Scenario: Verify target cannot be resolved
- **WHEN** a non-placeholder verify names no existing path and no recognized package script
- **THEN** lint emits an artifact-specific warning while preserving all independent lint errors

#### Scenario: Local verify target exists
- **WHEN** a verify names an existing repository file or directory or a present package script
- **THEN** trust validation emits no unresolved-target warning

### Requirement: Resolved task scope overlap warning
<!-- source: src/core/scope.ts, src/core/linter.ts, tests/scope-lint.test.ts -->
The linter SHALL compare the existing files produced by the shared scope
resolver for every pair of tasks in one change. Every shared file SHALL emit a
deterministic warning naming both task numbers and the project-relative POSIX
path. Warnings SHALL NOT make an otherwise valid change fail.

Duplicate declarations within one task SHALL not warn. Missing exact paths and
unmatched globs SHALL not count as shared files. Pair and path ordering SHALL be
stable regardless of task directory or filesystem enumeration order.

#### Scenario: Two tasks resolve one file
- **WHEN** two task scopes resolve to the same existing file
- **THEN** lint warns with both task numbers and the file while remaining valid when no error exists

#### Scenario: Three tasks resolve one file
- **WHEN** three task scopes resolve to the same existing file
- **THEN** lint emits one warning for each deterministic task pair without a self-warning

#### Scenario: Declarations have no existing overlap
- **WHEN** repeated scope text names only missing exact paths or unmatched globs
- **THEN** lint emits no overlap warning

### Requirement: Harness event fixture scope warning
<!-- source: src/core/linter.ts, tests/linter.test.ts -->
The linter SHALL use the shared deterministic scope resolution already computed
for each task to detect harness implementation scope without corresponding
event fixture coverage. When resolved scope contains any file below
`src/harness/` but contains no file below `tests/fixtures/events/`, lint SHALL
emit one deterministic non-failing warning for that task naming
`tests/fixtures/events/`.

The warning SHALL be absent when an exact fixture file, the fixture directory,
or a supported glob declaration resolves fixture content. It SHALL NOT add a
second scope matcher or make an otherwise valid change fail.

#### Scenario: Harness scope omits event fixtures
- **WHEN** a task resolves at least one `src/harness/` file and no `tests/fixtures/events/` file
- **THEN** lint remains valid and emits one warning naming the task and `tests/fixtures/events/`

#### Scenario: Harness scope includes event fixtures
- **WHEN** the same task's exact, directory, or glob scope resolves content under `tests/fixtures/events/`
- **THEN** lint emits no harness event fixture warning
