# Spec Delta: Spec Lint and Approve

## MODIFIED Requirements

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
