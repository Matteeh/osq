---
title: Dead letter retry and rejection
depends_on: ["035"]
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - watcher-and-harness
    - status-inspection
    - metrics-and-reporting
---
## Goal

Complete the dead letter queue with explicit retry and rejection transitions.

A failed task can be retried without deleting its diagnostics, with the next
agent receiving the failure reason and previous result. A change that should
not continue can be moved intact into rejected history instead of being
deleted, while status, dependency resolution, and reporting retain an
auditable account of that decision.

## Verify

`pnpm verify`

The suite includes a local mock-harness fixture driven through the real
`osq watch --once` command. It fails once, is retried through the CLI, and then
lands. The fixture asserts the retained marker, `retry` event, matching
`started.attempt`, prior failure context, and successful archival. It requires
no network, authentication, real model, or TTY.

## Non-goals

- Automatic retry.
- Selecting a different model or harness for a retry.
- Interactive retry or rejection prompts.
- Undo or restoration of a rejected change.
- UI work.

## Contract

### Requirement: Explicit retry transition

The CLI SHALL provide `osq retry <id> <target>`, where `<target>` is a numeric
task or the literal `change` for `.run/regressed/change.md`.

A numeric target SHALL be retryable only while it has an active
`.run/dead/<n>.md` or `.run/regressed/<n>.md` marker. The `change` target SHALL
be retryable only while `.run/regressed/change.md` exists. A numeric target
with `.run/running/<n>.pid`, or a change target with any running task, SHALL be
refused without modifying markers or events.

Retry SHALL rename each active failure marker rather than delete it. The
retained suffix SHALL be the next failure-attempt ordinal for that target,
counting previously retained dead and regressed markers. Thus an initial
failure becomes `<target>.1.md`, and a later failure becomes
`<target>.2.md`.

When a task-level regression has an active `.run/done/<n>` marker, retry SHALL
also preserve it under an inactive attempt-suffixed name so the task derives as
pending and can spawn again.

#### Scenario: Dead task is made pending
- **WHEN** `osq retry <id> <n>` runs for a dead task with no retained failures
- **THEN** `.run/dead/<n>.md` becomes `.run/dead/<n>.1.md`, the task becomes pending, and no diagnostic marker is deleted

#### Scenario: Regressed task is made pending
- **WHEN** a completed task has active regressed and done markers and is retried
- **THEN** both active markers are retained under inactive attempt-suffixed names and the task becomes eligible to spawn again

#### Scenario: Change-level regression is retried
- **WHEN** `osq retry <id> change` runs with `.run/regressed/change.md`
- **THEN** the marker is renamed to its attempt-suffixed history name so archive verification may run again

#### Scenario: Invalid retry state
- **WHEN** the requested target is neither dead nor regressed, does not exist, or is running
- **THEN** retry exits non-zero without modifying markers or appending an event

### Requirement: Approval integrity before retry

Retry SHALL compare the current change-folder hash with `.run/approved` before
performing any transition. A missing or mismatched approval SHALL be refused
without modifying markers or events, and the error SHALL name
`osq approve <id>` as the next step. Retry SHALL never approve a change on the
caller’s behalf.

Approval itself SHALL no longer rename active dead markers; retry is the sole
transition that retires active dead or regressed markers.

#### Scenario: Authored files changed after approval
- **WHEN** a failed change no longer matches its approved hash
- **THEN** retry refuses, preserves all failure state, and directs the user to run `osq approve <id>`

#### Scenario: Reapproval does not imply retry
- **WHEN** a failed change is approved again
- **THEN** its active dead or regressed marker remains active until `osq retry` succeeds

### Requirement: Retry and attempt event history

A successful retry SHALL append one typed `retry` event to the target’s event
stream. The event SHALL contain the target, reason being retried, next execution
attempt number, and timestamp.

Every newly emitted `started` event SHALL contain an attempt number. An initial
execution is attempt 1. The first execution after a retry is attempt 2, and its
attempt SHALL equal the preceding retry event’s attempt. Attempt derivation
SHALL remain reconstructible from retained files and append-only events after a
watcher restart.

#### Scenario: Retry event precedes matching start
- **WHEN** a failed task is retried and the watcher next spawns it
- **THEN** its event stream contains `retry` followed by `started` with the same next-attempt number

#### Scenario: Initial execution
- **WHEN** a task spawns without any retained failures
- **THEN** its `started` event records `attempt: 1`

### Requirement: Retried agent receives prior context

The next task spawn after retry SHALL include the retained failure reason and
the existing `.run/results/<n>.md` path in the prior-result section of every
executor prompt. The previous result file SHALL remain in place until the new
attempt writes its result.

#### Scenario: Retry survives watcher restart
- **WHEN** retry completes, the watcher restarts, and the task later spawns
- **THEN** the fresh agent prompt still identifies the retried reason and previous result file

### Requirement: Explicit rejection transition

The CLI SHALL provide `osq reject <id> --reason <text>` and require a non-empty
reason.

An unapproved active change is eligible for rejection. An approved active
change is eligible only when it has an active dead or regressed task or
change-level regression and no task is running. A healthy approved, completed,
archived, already rejected, or running change SHALL be refused.

A successful rejection SHALL move the entire original change folder to
`openspec/changes/rejected/<original-folder-name>/`. It SHALL then write
`.run/rejected.md` containing the reason and timestamp and append one typed
`rejected` event with the same values to `.run/events/change.jsonl`. Existing
briefs, proposals, tasks, delta specs, results, markers, `plan.jsonl`, and event
streams SHALL otherwise remain byte-for-byte intact. An existing destination
SHALL cause refusal rather than replacement or suffixing.

#### Scenario: Unapproved change is rejected
- **WHEN** an unapproved change is rejected with a reason
- **THEN** its complete folder moves under `rejected/` and gains the rejection marker and event

#### Scenario: Failed approved change is rejected
- **WHEN** an approved change has an active dead or regressed marker and nothing running
- **THEN** rejection succeeds without applying its deltas or archiving it as landed

#### Scenario: Ineligible approved change
- **WHEN** an approved change is healthy, running, or already complete without a failure
- **THEN** rejection exits non-zero and leaves the folder in place

### Requirement: Rejected change visibility

`osq status` SHALL list rejected changes in a distinct `Rejected specs` group,
separate from active and archived changes. Each entry SHALL expose its folder,
title, rejection reason, and rejection timestamp when available.

#### Scenario: Status contains all lifecycle groups
- **WHEN** active, archived, and rejected changes exist
- **THEN** status renders rejected changes only in their dedicated group without including them in active or archived counts

### Requirement: Rejection history reporting

The report’s `history` block SHALL include rejected-change totals and counts
grouped by the `planner` value in `brief.md` frontmatter. A rejected change
without a recorded planner model SHALL be grouped as `unknown`.

Only a valid `rejected` event in a rejected change’s change-level event stream
SHALL contribute to rejection history.

#### Scenario: Rejections from multiple planner models
- **WHEN** rejected changes contain valid rejected events and recorded planner models
- **THEN** report history exposes the total and deterministic per-model counts

#### Scenario: Rejection without planner metadata
- **WHEN** a rejected change has no valid planner field in `brief.md`
- **THEN** it contributes to the total and the `unknown` group

### Requirement: Rejected dependencies never land

Dependency existence validation SHALL recognize a change retained under
`rejected/`, but dependency completion resolution SHALL never treat that change
as landed.

#### Scenario: Dependency is rejected
- **WHEN** an active change declares `depends_on` for a rejected change
- **THEN** the reference remains auditable and the dependent change remains blocked

## Human steps

- Finish and archive dependency 035 before approving or executing this change.
- After reviewing the completed task bodies and deltas, run `pnpm osq approve 036` yourself. Neither planner nor executor approves the change.

## Delta

- `specs/cli-foundation/spec.md`: retry and reject command surfaces, targets, validation, and rejection destination.
- `specs/spec-lint-and-approve/spec.md`: approval no longer retires dead markers, retry hash integrity, and rejected dependency existence.
- `specs/watcher-and-harness/spec.md`: retained failure transitions, retry/rejected events, attempt numbering, and prior failure prompt context.
- `specs/status-inspection/spec.md`: rejected status group and rejected dependency state.
- `specs/metrics-and-reporting/spec.md`: rejection totals and planner-model grouping in report history.
