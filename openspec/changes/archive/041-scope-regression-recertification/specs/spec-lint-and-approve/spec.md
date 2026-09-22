# Spec Delta: Spec Lint and Approve

## ADDED Requirements

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
