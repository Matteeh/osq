---
title: Scope regression recertification
depends_on: ["040"]
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - metrics-and-reporting
    - spec-lint-and-approve
    - status-inspection
    - watcher-and-harness
---
## Goal

Turn scope-hash drift into a verified, human-controlled recertification
workflow. The watcher audits every affected completed task before dispatch and
archival, records whether its verification still passes, and blocks further
progress without charging an execution attempt. `osq retry` then either
refreshes the trusted completion record or requeues the task with the failed
verification context.

## Verify

`pnpm verify`

The suite includes mock-harness fixtures proving that task 2 may change a task
1 file while task 3 is due without task 3 being locked or counted; passing and
failing detection verification, human recertification and agent requeue;
multiple stale tasks in one audit; final-task drift blocking archival;
attributed, ambiguous, and unknown edits; verification timeout; idempotent
halted cycles; placeholder verification rejection; and a full-suite pass in
which every test-authored change submitted to lint or approval uses a real
local verifier.

## Non-goals

- Automatically clearing a regression without a human command.
- Expanding scope globs or adding overlap lint.
- Changing configured limits or adding configuration switches.
- Exempting paths from scope comparison.
- Changing the existing archive verification semantics.
- Parallel execution.
- Modifying change 039's retained tasks or history.

## Contract

### Requirement: Pre-dispatch scope recertification audit

Before taking an upcoming task's lock, the watcher SHALL compare every earlier
done task's recorded literal scope hashes with the current tree in one pass.

Each stale task SHALL have its verification command run under the configured
verification timeout. Whether verification passes or fails, the watcher SHALL
write `regressed/<n>.md` containing differing paths, verification command, exit
code and output, recorded and current scope hashes, and attribution, then
append one `regressed` event to task `<n>`.

A stale task SHALL produce `blocked_by_regression`. The upcoming task SHALL not
be locked, marked running, counted in `tasksRun`, or given dead or regressed
artifacts. Logging SHALL contain one line attributed to each stale task followed
by one summary such as
`spec 039 halted: tasks 1, 2 require recertification`.

#### Scenario: Multiple stale tasks before dispatch
- **WHEN** more than one earlier done task has a differing recorded scope
- **THEN** every stale task is verified and recorded in the same audit while the upcoming task remains untouched

#### Scenario: Repeated halted cycles
- **WHEN** another watcher cycle observes unchanged active regression markers
- **THEN** no duplicate regression marker, event, or verification run is produced

#### Scenario: Verification timeout
- **WHEN** stale-task verification exceeds `verifyTimeoutSeconds`
- **THEN** the regression record contains the timeout result and the change remains blocked for human recertification

### Requirement: Archive scope recertification audit

Before the existing archive-time task and change verification sequence, the
archiver SHALL run the same audit across every done task.

#### Scenario: Final task invalidates earlier completion
- **WHEN** the final task changes a file recorded by an earlier done task
- **THEN** the earlier task is verified and marked regressed, archival halts, and the existing archive verifier does not begin

#### Scenario: Archive audit passes
- **WHEN** every done task's recorded scope hashes still match
- **THEN** the existing archive verification and archival semantics proceed unchanged

### Requirement: Recorded-edit attribution

Each differing path SHALL be attributed to a later done task only when exactly
one later task's recorded `file_changed` events name that path and the current
content hash matches that task's completion hash when such a hash is available.

Multiple qualifying later tasks SHALL yield `ambiguous`. No qualifying task,
or a candidate contradicted by its completion hash, SHALL yield `unknown`.

#### Scenario: Unique later editor
- **WHEN** exactly one later done task recorded the path and its completion hash agrees with the tree
- **THEN** the regression marker and event attribute the path to that task

#### Scenario: Attribution cannot be established
- **WHEN** multiple later tasks recorded the path or no trustworthy later completion matches it
- **THEN** attribution is recorded as `ambiguous` or `unknown` respectively

### Requirement: Explicit human recertification

`osq retry <id> <n>` on an active task regression SHALL run the task's
verification command without spawning an agent.

On exit zero, retry SHALL retire the active regression marker using the existing
attempt-suffixed history convention, retain canonical `done/<n>`, preserve
completion and build metadata, set `original_scope_hash` from the prior
`scope_hash` only when absent, replace `scope_hash` and `scope_files`, add
`recertified_at`, increment `recertification_count`, and append a
`recertification` event with `outcome: passed`. Passing recertification SHALL not
increment execution attempts.

On non-zero exit, retry SHALL retire both active regression and done markers,
append a `recertification` event with `outcome: requeued`, and leave the task
pending for agent execution. The next executor prompt SHALL include the failed
verification output.

Every recertification event SHALL carry the task, differing paths, verification
command and result, and original and current scope hashes. Dead-task retry and
change-level retry SHALL remain unchanged.

#### Scenario: Passing recertification
- **WHEN** a human retries a regressed task whose verification now passes
- **THEN** its trusted done record is refreshed without an agent spawn or new execution attempt

#### Scenario: Failed recertification
- **WHEN** a human retries a regressed task whose verification fails
- **THEN** its prior artifacts are retained as history and the task is requeued with the failure output available to the executor

### Requirement: Trustworthy verify-command lint

`osq lint` SHALL reject proposal and task verification commands equal to the
template placeholder or a normalized equivalent. It SHALL reject a referenced
`package.json` script that does not exist and warn when a command names neither
an existing repository path nor a package script.

Checked-in fixtures using the placeholder SHALL use real local verification
scripts, and consumer documentation SHALL no longer present the placeholder as
acceptable verification.

Test-authored changes submitted to lint or approval SHALL likewise replace the
planning sentinel with a deterministic verifier backed by their temporary
project root. The sentinel may remain only where rejection itself is under test
or where it is inert command/event data that is never submitted as an authored
change.

#### Scenario: Placeholder verification
- **WHEN** a verify command is the template placeholder or differs only by normalization
- **THEN** lint fails with an actionable message requiring a real final-tree verification command

#### Scenario: Missing package script
- **WHEN** a verify command invokes a package script absent from the applicable `package.json`
- **THEN** lint fails and identifies the missing script

#### Scenario: Unresolved verification target
- **WHEN** a verify command names no existing path and no package script
- **THEN** lint emits a warning without treating the command as trusted coverage

#### Scenario: Approved test fixture
- **WHEN** a repository test submits a generated proposal or task to lint or approval
- **THEN** the fixture has already replaced the planning sentinel with a deterministic local verifier

### Requirement: Final-tree planner discipline

Managed planner guidance SHALL require every task verification command to be
safely re-runnable against the completed change's final tree.

The guidance SHALL also require a file to belong to one task unless a later
task must extend it. Any intentional shared file SHALL be assigned to the later
task in dependency order and called out in the proposal.

#### Scenario: Planner instructions are scaffolded
- **WHEN** `PLANNER.md` is created or refreshed
- **THEN** its managed block contains both final-tree verification and ordered shared-file ownership rules byte-for-byte across all managed copies

### Requirement: Scope regression history

The report `history` block SHALL expose `scopeRegressions` with counts for
detected regressions, verification passed at detection, verification failed at
detection, human recertifications, and tasks requeued for an agent.

#### Scenario: Mixed regression outcomes
- **WHEN** event history contains passing and failing detections plus passing and requeued recertifications
- **THEN** text and stable JSON report each category deterministically without changing execution-attempt counts

### Requirement: Recertification inspection

`osq show <id>` SHALL identify recertified tasks and display their recorded
attribution.

#### Scenario: Recertified task details
- **WHEN** a change contains a successful recertification event
- **THEN** show output lists the task as recertified with its differing paths and attribution

## Task boundary note

Task 1 established the shared literal scope hashing, verification result, and
event contracts; its repair retry owns only the three final-tree behavioral
suites that still generate rejected fixture commands. Task 2 consumes those
contracts from the archiver without reopening their files. Task 3 owns the
final `src/harness/types.ts` changes for the `recertification` event and
failed-verification prompt context. The repair does not reopen completed source
work or another task's files. Task 8 is the final repair owner for fixture setup
in the 24 test files named in its Details. Its broad test globs exist only to
fit that explicit set within the configured scope-entry limit; every earlier
task's test file and all production code remain frozen.

## Human steps

- After reviewing these task bodies and deltas, run `pnpm osq approve 041` yourself, then `pnpm osq retry 041 change` to retire the current change-level verification regression. Neither planner nor executor approves or retries the change.

## Delta

- `specs/watcher-and-harness/spec.md`: pre-lock and pre-archive audits, attribution, idempotent regression records, reusable verification, recertification transitions, and lifecycle events.
- `specs/cli-foundation/spec.md`: retry behavior, executor failure context, consumer documentation, and managed planner guidance.
- `specs/spec-lint-and-approve/spec.md`: placeholder, package-script, and unresolved-target verification lint.
- `specs/metrics-and-reporting/spec.md`: scope-regression history counters.
- `specs/status-inspection/spec.md`: recertification and attribution display in `osq show`.
