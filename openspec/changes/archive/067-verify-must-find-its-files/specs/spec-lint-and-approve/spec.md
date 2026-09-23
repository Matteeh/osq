# Spec Delta: Spec Lint and Approve

## ADDED Requirements

### Requirement: Verify start contradiction
<!-- source: src/core/spec/verify-paths.ts, src/core/spec/verify-starts.ts, src/core/spec/linter.ts, src/core/run/scope.ts, tests/verify-paths.test.ts, tests/lint-verify-starts.test.ts -->
A verify's named paths SHALL be its operands that are not options, absolute,
assignments, URLs, or a bare first token, and that contain a path separator. A
glob operand SHALL be present when it matches a file. For each missing named
path not covered by an earlier task's scope, lint SHALL warn when the task
declares `green` or `any` and its own scope covers the path, and SHALL warn when
no scope covers it.

#### Scenario: Task creates its own test but declares any
- **WHEN** a task declares `verify_starts: any` and its verify names an existing test and a missing test inside its own scope
- **THEN** lint warns naming the task, the path, and the declared start

#### Scenario: Declared red
- **WHEN** the same task declares `red`
- **THEN** lint emits no contradiction warning

#### Scenario: Earlier task creates the path
- **WHEN** a task's verify names a missing file that an earlier task's scope covers
- **THEN** lint emits neither warning, whatever the task declares

#### Scenario: No task can create the path
- **WHEN** a task's verify names a missing file outside every task's scope up to and including its own
- **THEN** lint warns that no task in the change can create it

#### Scenario: Operands that are not paths
- **WHEN** a verify has quoted operands, `--import tsx`, `KEY=value`, or a URL
- **THEN** none of them is a named path, and a glob operand matching no file counts as missing

## MODIFIED Requirements

### Requirement: Verify-command trust validation
<!-- source: src/core/linter.ts, src/core/spec/verify-paths.ts, tests/linter.test.ts, tests/lint-verify-starts.test.ts -->
The linter SHALL analyze the proposal verify command and every task verify
command without executing or shell-expanding them. The template sentinel
`node -e "process.exit(0)"` and normalized equivalents SHALL be errors. A
recognized package-script invocation naming no script in the project-root
`package.json` SHALL be an error. Any other command that names neither an
existing repository-relative path, a recognized package script, nor a missing
path the scope of its task or an earlier task covers SHALL emit a warning.

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
- **WHEN** a non-placeholder verify names no existing path, no recognized package script, and no path a task scope covers
- **THEN** lint emits an artifact-specific warning while preserving all independent lint errors

#### Scenario: Local verify target exists
- **WHEN** a verify names an existing repository file or directory or a present package script
- **THEN** trust validation emits no unresolved-target warning

#### Scenario: Verify names only its new test
- **WHEN** a task verify names only a test file that does not exist yet and the task's scope covers it
- **THEN** trust validation emits no unresolved-target warning

### Requirement: Approval flags
<!-- source: src/core/spec/digest-flags.ts, src/core/spec/digest.ts, src/core/spec/verify-starts.ts, tests/approval-digest.test.ts, tests/approval-digest-verify-starts.test.ts -->
The digest SHALL raise `shared_file` for task pairs whose resolved scopes share
a path, `sensitive_path` for resolved scope paths that are package manifests,
lockfiles, CI workflows, `osq.config.*`, OpenSpec config, managed instruction
files, or env files, `verify_without_test` for a verify naming no test file or
runner, `removed_requirement` for removing deltas, `unknown_capability` for a
delta whose living capability does not exist, and `verify_starts_conflict` for
each verify start contradiction.

#### Scenario: Shared file
- **WHEN** tasks 1 and 2 both resolve `src/a.ts`
- **THEN** one `shared_file` flag labelled `shared files in tasks 1 and 2` names the file and says the watcher will halt for recertification when task 2 changes it

#### Scenario: Env file templates
- **WHEN** a scope resolves `.env.example`, `.env.sample`, or `.env.template`
- **THEN** no `sensitive_path` flag fires for that file, while `.env` and `.env.local` do fire

#### Scenario: Verify with a runner
- **WHEN** a verify is `pnpm verify` or `node --import tsx --test tests/a.test.ts`
- **THEN** no `verify_without_test` flag fires for it, while `npx tsc --noEmit` fires one

#### Scenario: Approval line
- **WHEN** two flags fire and approval proceeds
- **THEN** each flag prints on its own line after the digest and the approval line reads `Approved <id> (<folder>) with 2 flags: <label>, <label>`

#### Scenario: Verify start conflict
- **WHEN** a task declares `any` or `green` and its verify names a missing test inside its own scope
- **THEN** one `verify_starts_conflict` flag labelled `verify starts conflict in task <n>` names the path and the declared start, and the same task declaring `red` raises none
