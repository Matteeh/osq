# Spec Delta: Spec Lint and Approve

## ADDED Requirements

### Requirement: Capability creation
<!-- source: src/core/spec/digest-capability.ts, src/core/spec/digest-flags.ts, src/core/spec/digest.ts, tests/approval-digest-capability.test.ts -->
A delta capability with no living spec SHALL count as deliberately created when
its delta has a `## Purpose` section and its name resembles no living
capability. Any other delta capability with no living spec SHALL raise one
`unknown_capability` flag, labelled `unknown capability <name> resembles
<living>` when a resemblance exists, naming the first resembling living
capability in name order, and otherwise `unknown capability <name> without a
Purpose`.

#### Scenario: Deliberate creation
- **WHEN** a delta with `## Purpose` targets a new name that resembles no living capability
- **THEN** no `unknown_capability` flag fires and the formatted digest shows its heading as `<name> (new capability):`

#### Scenario: Missing Purpose
- **WHEN** a delta without `## Purpose` targets a capability with no living spec and a name resembling none
- **THEN** one `unknown_capability` flag labelled `unknown capability <name> without a Purpose` fires

#### Scenario: Resembling name
- **WHEN** a delta with `## Purpose` targets `watcher-harness` and `watcher-and-harness` has a living spec
- **THEN** one `unknown_capability` flag labelled `unknown capability watcher-harness resembles watcher-and-harness` fires

### Requirement: Capability name resemblance
<!-- source: src/core/spec/digest-capability.ts, tests/approval-digest-capability.test.ts -->
A new capability name SHALL resemble a living capability name when the two are
equal once hyphens and underscores are removed, when the words of one, split on
hyphens and underscores, all appear among the words of the other, or when both
are at least five characters long and their edit distance is at most two.

#### Scenario: Word subset
- **WHEN** `watcher-harness` is compared with `watcher-and-harness`
- **THEN** they resemble each other

#### Scenario: Short dissimilar names
- **WHEN** `cli` is compared with `api`
- **THEN** they do not resemble each other

## MODIFIED Requirements

### Requirement: Approval digest
<!-- source: src/core/spec/digest.ts, src/core/spec/digest-flags.ts, src/cli/approve.ts, tests/approval-digest.test.ts -->
`buildApprovalDigest` SHALL summarize a change from its authored files: the
first two sentences of the proposal's `## Goal`, one entry per task with its
title and the number of existing files in its resolved scope, and per delta
capability the requirement names added, modified, and removed, and whether the
change deliberately creates it. It SHALL list, as information and never as
flags, each task with `tests.modify: true` and the existing test files in its
resolved scope, and the `## Human steps` text. It SHALL reuse `resolveScope` and
`parseDelta` and add no parsing of its own.

#### Scenario: Digest content
- **WHEN** a change with two tasks and one delta is digested
- **THEN** the digest holds the goal's first two sentences, both task titles with their scope file counts, and the delta's requirement names by kind

#### Scenario: Test modification is information
- **WHEN** a task declares `tests.modify: true` with an existing test in scope
- **THEN** the digest lists that task and test and raises no flag for it

### Requirement: Approval flags
<!-- source: src/core/spec/digest-flags.ts, src/core/spec/digest.ts, src/core/spec/verify-starts.ts, tests/approval-digest.test.ts, tests/approval-digest-verify-starts.test.ts -->
The digest SHALL raise `shared_file` for task pairs whose resolved scopes share
a path, `sensitive_path` for resolved scope paths that are package manifests,
lockfiles, CI workflows, `osq.config.*`, OpenSpec config, managed instruction
files, or env files, `verify_without_test` for a verify naming no test file or
runner, `removed_requirement` for removing deltas, `unknown_capability` for a
delta capability with no living spec that is not deliberately created, and
`verify_starts_conflict` for each verify start contradiction.

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
