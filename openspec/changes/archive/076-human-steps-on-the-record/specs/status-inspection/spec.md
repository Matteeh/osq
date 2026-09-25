# Spec Delta: Status Inspection

## ADDED Requirements

### Requirement: Change next step
<!-- source: src/core/status/next-step.ts, tests/next-step.test.ts -->
`readNextStep(projectRoot, folderPath, config)` SHALL return `{ state,
command, detail }` for an active or archived change. Unapproved, it SHALL be
`unplanned` when its verify is missing or the placeholder, else
`ready-for-approval`. Approved, it SHALL be `dead` for a dead or regressed task
or change, `blocked` for unmet dependencies, else `running`. Archived, it SHALL
be `verification-pending` or `landed`.

#### Scenario: Fresh template
- **WHEN** a change created by `osq plan` still has the placeholder verify
- **THEN** its next step is `unplanned` with command `osq plan <id>`

#### Scenario: Plain archived change
- **WHEN** an archived change's `archived` event carries no `verification`
- **THEN** its next step is `landed` with a null command

### Requirement: Next step commands
<!-- source: src/core/status/next-step.ts, tests/next-step.test.ts -->
The command SHALL be `osq plan <id>` for `unplanned` with `brief.md`, else
`osq lint <id>`; `osq approve <id>`; `osq show <id>` for `running`;
`osq retry <id> <n>` for the first dead or regressed task, else
`osq reject <id> --reason <text>`; `osq show <dep>` for the first unmet
dependency; `osq check <id>` while a check has not run since archive, else
`osq verified <id> --passed|--failed`; and null for `landed`.

#### Scenario: Blocked change
- **WHEN** an approved change depends on 012, which is not landed
- **THEN** its next step is `blocked` with command `osq show 012` and detail `waiting for 012`

### Requirement: Next step detail and format
<!-- source: src/core/status/next-step.ts, tests/next-step.test.ts -->
`detail` SHALL be `do the steps before approval first` for a
`ready-for-approval` change with steps before approval, `waiting for <ids>` for
`blocked`, `failed` for a `verification-pending` change whose latest outcome
failed, and null otherwise. `formatNextStep` SHALL render the state with spaces
for hyphens, then ` (<detail>)` when set, then ` — <command>` when set.

#### Scenario: Failed verification
- **WHEN** an archived change's latest `verification_recorded` outcome is `failed`
- **THEN** `formatNextStep` renders `verification pending (failed) — osq verified <id> --passed|--failed`

### Requirement: Verification state
<!-- source: src/core/status/verification.ts, tests/next-step.test.ts -->
`readVerification(folderPath)` SHALL read an archived change's
`.run/events/change.jsonl`, skipping malformed lines. A change SHALL require
verification when its latest `archived` event carries `verification`, and SHALL
be verification pending while it requires verification and its latest
`verification_recorded` outcome is not `passed`. `listPendingVerifications`
SHALL return every pending archived change in numeric order.

#### Scenario: Passed then failed
- **WHEN** a change records `passed` and later `failed`
- **THEN** it is verification pending with outcome `failed`

### Requirement: Verification pending dependency
<!-- source: src/core/status/dependency-readiness.ts, src/core/status/state.ts, tests/verification-dependents.test.ts -->
Runtime dependency resolution SHALL treat an archived dependency as met only
when it is not verification pending. A pending or failed dependency SHALL keep
its dependents blocked. An archived dependency whose `archived` event carries no
`verification` SHALL be met, as before.

#### Scenario: Pending dependency
- **WHEN** change 013 depends on archived change 012, which is verification pending
- **THEN** 013 derives as blocked until 012 records `passed`

### Requirement: Explicit status with next steps
<!-- source: src/core/status/status.ts, src/cli/status.ts, tests/next-step.test.ts, tests/status.test.ts -->
`osq status` SHALL keep its task table, archive count, and rejected group, and
print `  next: <next step>` under each active change. It SHALL list verification
pending archived changes under `Verification pending:` before `Archived specs`,
as `<folder>: <title> — <next step>`. It SHALL NOT read or advance last-look
state.

#### Scenario: Full status with next steps
- **WHEN** a user executes `osq status` with an unplanned change and a pending archived change
- **THEN** the change's line is followed by `  next: unplanned — osq plan <id>`, the pending change is listed, and no last-look cursor is mutated

### Requirement: Planning inbox items
<!-- source: src/core/status/inbox.ts, src/core/status/inbox-text.ts, tests/inbox-next-step.test.ts -->
The inbox SHALL show an unapproved change whose next step is `unplanned` as a
`planning` item with that command instead of an approval item. An approval item
whose change has steps before approval SHALL carry `beforeApproval: true`, and
its text line SHALL read `— do the steps before approval first — osq approve
<id>`. A planning line SHALL read `— unplanned — <command>`.

#### Scenario: Fresh template in the inbox
- **WHEN** a change still has the placeholder verify
- **THEN** the inbox lists it as `planning` with `osq plan <id>` and offers no `osq approve <id>`

### Requirement: Verification inbox items
<!-- source: src/core/status/inbox.ts, src/core/status/inbox-projection.ts, src/core/status/inbox-text.ts, tests/inbox-next-step.test.ts -->
Every verification pending archived change SHALL add one needs-you item after
the active items, in numeric order: `verification-failed` when its latest
outcome failed, else `verification-pending`, with `task: null` and its next-step
command. The text line SHALL read `— verification pending — <command>` or `—
verification failed — <command>`.

#### Scenario: Failed outcome in the inbox
- **WHEN** archived change 012 records `failed`
- **THEN** the inbox lists a `verification-failed` item for 012 with `osq verified 012 --passed|--failed`

### Requirement: Show next step
<!-- source: src/core/status/show.ts, src/cli/show.ts, tests/show-next-step.test.ts -->
`osq show <id>` SHALL print `Next: <next step>` after `Status:` for active and
archived changes, and `--json` SHALL carry `next: { state, command, detail }`.
For an archived change that requires verification, it SHALL print a
`Verification:` section with each `check_ran` event's time, command, and exit
code and each `verification_recorded` event's time, outcome, and note.

#### Scenario: Archived change with an outcome
- **WHEN** `osq show 012` runs on an archived change that recorded `passed`
- **THEN** it prints `Next: landed` and a `Verification:` section with the outcome

## MODIFIED Requirements

### Requirement: Stable inbox object
<!-- source: src/core/status/inbox.ts, src/cli/inbox.ts, tests/inbox.test.ts, tests/inbox-stuck.test.ts, tests/disclosures-inbox-show.test.ts, tests/inbox-next-step.test.ts -->
The inbox object SHALL have exactly the top-level array properties `needsYou`,
`running`, and `landed`.

A needs-you item SHALL contain `kind`, `change: { id, title }`, nullable `task`,
and `command`. Its kind SHALL be one of `planning`, `approval`, `task-dead`,
`task-regressed`, `change-regressed`, `verification-pending`, or
`verification-failed`; only task kinds SHALL carry `task: { number, title }`. A
`task-dead` item for a stuck task SHALL also carry `stuck: { fingerprint }`; no
other item carries `stuck`. An approval item whose change has steps before
approval SHALL also carry `beforeApproval: true`; no other item carries
`beforeApproval`. A running item SHALL contain `change`, `task`, numeric `pid`,
ISO `startedAt`, integer non-negative `elapsedSeconds`, and `command`. A landed
item SHALL contain `change`, ISO `archivedAt`, and `command`. A landed item
whose tasks disclosed anything SHALL also carry `disclosures: { deviated,
missingContext, outsideScope }`, the number of tasks with each real section; no
other landed item carries `disclosures`. Empty groups SHALL be empty arrays and
JSON output SHALL contain no additional prose or metadata.

#### Scenario: JSON contract projection
- **WHEN** the inbox is serialized for `osq --json`
- **THEN** its property set, discriminants, nested identities, value types, and deterministic array ordering match the stable contract

#### Scenario: Text and JSON parity
- **WHEN** text and JSON are rendered from an equivalent filesystem snapshot and clock
- **THEN** both representations contain the same ordered items, commands, elapsed values, and archive timestamps

#### Scenario: Stuck field
- **WHEN** a dead task is stuck
- **THEN** its `task-dead` item carries `stuck: { fingerprint }` and every other item's JSON is unchanged

#### Scenario: Landed change with disclosures
- **WHEN** a landed change has one task with a real `## Outside scope` section
- **THEN** its landed item carries `disclosures: { deviated: 0, missingContext: 0, outsideScope: 1 }`, its text line ends with `— disclosed: outside scope 1`, and every other landed item is unchanged

#### Scenario: Steps before approval
- **WHEN** an unapproved planned change has `### Before approval` steps
- **THEN** its approval item carries `beforeApproval: true` and every other item's JSON is unchanged

### Requirement: Brief queue state projection
<!-- source: src/core/queue.ts, src/cli/queue.ts, tests/queue.test.ts, src/core/status/queue-state.ts, tests/verification-dependents.test.ts -->
Queue state SHALL be derived afresh from `queue_item` and `queue_hash` metadata
in active, archived, and rejected change briefs plus canonical task markers.
Unrelated folders SHALL not associate by name alone.

An archived association SHALL derive as landed, or as `verification-pending`
while its change is verification pending. An active association SHALL derive as
dead for dead or regressed state, running for running state, approved for any
other approved state, and planned when unapproved. Rejected history without an
active or archived association SHALL derive as rejected; no association SHALL
derive as unplanned. Rows SHALL include the selected change id, all retained
rejection attempts, unmet queue dependencies, and a changed since planned
annotation when the selected association's recorded section hash does not equal
the current section hash.

Only a landed archived queue association SHALL satisfy a queue dependency.
Verification pending, rejected, done-but-unarchived, manually name-matched, and
missing associations SHALL not land an item. Ambiguous multiple active or
archived associations SHALL be reported rather than silently selected.

#### Scenario: Mixed queue lifecycle
- **WHEN** current queue items have active, archived, rejected, and absent associations
- **THEN** every item receives one deterministic state plus change, rejection, dependency, and drift details

#### Scenario: Queue section changes after planning
- **WHEN** a current raw section hash differs from its associated brief's `queue_hash`
- **THEN** inspection reports changed since planned without rewriting or changing the state of the associated change

#### Scenario: Verification pending queue dependency
- **WHEN** queue item `beta` depends on `alpha`, whose archived change is verification pending
- **THEN** `alpha` shows as `verification-pending`, `beta` lists `alpha` as unmet, and `osq plan --next` does not select `beta`

## REMOVED Requirements

### Requirement: Explicit status remains complete
**Reason**: `osq status` now prints each change's next step and a verification pending group.
**Migration**: See "Explicit status with next steps".
