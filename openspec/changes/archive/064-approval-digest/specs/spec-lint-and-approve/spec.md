# Spec Delta: Spec Lint and Approve

## ADDED Requirements

### Requirement: Approval digest
<!-- source: src/core/spec/digest.ts, src/core/spec/digest-flags.ts, src/cli/approve.ts, tests/approval-digest.test.ts -->
`buildApprovalDigest` SHALL summarize a change from its authored files: the
first two sentences of the proposal's `## Goal`, one entry per task with its
title and the number of existing files in its resolved scope, and per delta
capability the requirement names added, modified, and removed. It SHALL list,
as information and never as flags, each task with `tests.modify: true` and the
existing test files in its resolved scope, and the `## Human steps` text. It
SHALL reuse `resolveScope` and `parseDelta` and add no parsing of its own.

#### Scenario: Digest content
- **WHEN** a change with two tasks and one delta is digested
- **THEN** the digest holds the goal's first two sentences, both task titles with their scope file counts, and the delta's requirement names by kind

#### Scenario: Test modification is information
- **WHEN** a task declares `tests.modify: true` with an existing test in scope
- **THEN** the digest lists that task and test and raises no flag for it

### Requirement: Approval flags
<!-- source: src/core/spec/digest-flags.ts, tests/approval-digest.test.ts -->
The digest SHALL raise `shared_file` for task pairs whose resolved scopes share
a path, `sensitive_path` for resolved scope paths that are package manifests,
lockfiles, CI workflows, `osq.config.*`, OpenSpec config, managed instruction
files, or env files, `verify_without_test` for a verify naming no test file or
runner, `removed_requirement` for removing deltas, and `unknown_capability` for
a delta whose living capability does not exist.

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

### Requirement: Approval confirmation
<!-- source: src/cli/approve.ts, src/cli/confirm.ts, src/core/spec/approve.ts, tests/approve-confirm.test.ts -->
`osq approve --confirm` SHALL, when flags fire and a terminal is attached,
print each flag with its excerpt and ask for confirmation defaulting to no.
Without a terminal it SHALL refuse, naming the flags, instead of waiting. A
declined or refused approval SHALL exit 1 and write no approval, manifest, or
planning record. Without flags, `--confirm` SHALL approve without asking.

#### Scenario: Confirmed at the prompt
- **WHEN** flags fire, a terminal is attached, and the approver answers `y`
- **THEN** the change is approved and the manifest records the flags with mode `confirmed`

#### Scenario: Default answer
- **WHEN** flags fire, a terminal is attached, and the approver presses enter
- **THEN** approval is declined and nothing is written

#### Scenario: No terminal
- **WHEN** flags fire and no terminal is attached
- **THEN** the command exits 1 naming the flags without prompting and writes nothing

## MODIFIED Requirements

### Requirement: Human approval sealing
<!-- source: src/core/spec/approve.ts, src/cli/approve.ts, src/core/report/planning-observed.ts, tests/planning-observed-approve.test.ts, tests/approve-confirm.test.ts -->
Before writing the approval seal and manifest, `osq approve` SHALL build and
print the approval digest and, under `--confirm`, obtain confirmation for any
flags. It SHALL then discover and append deduplicated local planning sessions
whose observed edits target the selected change. Reader absence, malformed
local data, and no matches SHALL not weaken lint or prevent approval. When no
reader matches, approval SHALL print one line stating that no planning record
was found.

#### Scenario: Sealing approved spec
- **WHEN** a user executes `osq approve <id>` on a change passing lint
- **THEN** the digest prints, observation runs, the manifest is built from recorded history, and the authored-content hash is written to `.run/approved`

#### Scenario: Approval observes matching planning
- **WHEN** a local supported-tool session edited the selected change in the observation window
- **THEN** its observed record is appended before the manifest is built and the approval seal covers only authored artifacts

#### Scenario: Approval observes no planning
- **WHEN** no supported local session matches the change and window
- **THEN** approval succeeds with null planner attribution and prints the one-line notice

#### Scenario: Declined confirmation
- **WHEN** confirmation is declined or refused
- **THEN** no planning record, manifest, or approval seal is written
