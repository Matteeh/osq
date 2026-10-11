# Spec Delta: status-inspection

## ADDED Requirements

### Requirement: Validator failing in status and inbox
`readValidatorFailing(projectRoot, config)` in
`src/core/status/validator-failing.ts` SHALL read the `validator_ran` events
of every archived change that `listChanges` finds, leave out `not_run` ones,
and order the rest by event timestamp. When the latest has outcome `failed`,
`timed_out` or `unreadable`, it SHALL return
`{ change: <folder name>, outcome, runs, error }`: `change` and `outcome` are
the latest run's, `runs` counts the latest runs in a row with one of those
outcomes, and `error` is the first non-blank line of the latest run's
`output`, trimmed, or its outcome when the output is absent or blank.
Otherwise it SHALL return null, so one `validated` run clears it. It SHALL
write nothing, and the archive SHALL never wait on it.

When it returns a value, `readInbox` SHALL add one needs-you item
`{ kind: 'validator-failing', change: { id, title }, task: null, command: 'osq show <id>', validatorFailing: { outcome, runs, error } }`
for that change, with the title from the change's proposal or else its folder
name, sorted with the other items by id. `formatInboxText` SHALL render it as
`  <id>: <title> — validator <outcome> <runs>× in a row: <error> — osq show <id>`.
`osq status` SHALL print
`Validator <outcome> <runs>× in a row, last on <id>: <error> — osq show <id>`
after its watcher line, its `Log:` line and its after-land line. When it
returns null, both SHALL print what they print today.

#### Scenario: Validator failing
- **WHEN** archived changes `001-a` titled `A` and `002-b` titled `B` each hold one `validator_ran` event, in time order, as in the row
- **THEN** the inbox and `osq status` show what the row says:

| `001-a` run | `002-b` run | needs-you item | `osq status` line |
| --- | --- | --- | --- |
| `failed`, output `[claude-code:unrecognized_model] {"model":"claude-opus-5-5"}\n\nClaude Code result: success` | the same | `{ kind: "validator-failing", change: { id: "002", title: "B" }, task: null, command: "osq show 002", validatorFailing: { outcome: "failed", runs: 2, error: "[claude-code:unrecognized_model] {\"model\":\"claude-opus-5-5\"}" } }`, text `  002: B — validator failed 2× in a row: [claude-code:unrecognized_model] {"model":"claude-opus-5-5"} — osq show 002` | `Validator failed 2× in a row, last on 002: [claude-code:unrecognized_model] {"model":"claude-opus-5-5"} — osq show 002` |
| `validated` | `timed_out`, no output | `validatorFailing: { outcome: "timed_out", runs: 1, error: "timed_out" }` for `002` | `Validator timed_out 1× in a row, last on 002: timed_out — osq show 002` |
| `failed`, output `boom` | `not_run` | `validatorFailing: { outcome: "failed", runs: 1, error: "boom" }` for `001` | `Validator failed 1× in a row, last on 001: boom — osq show 001` |
| `failed`, output `boom` | `validated` | none | none |

#### Scenario: No validator runs
- **WHEN** no archived change holds a `validator_ran` event
- **THEN** the inbox has no `validator-failing` item and `osq status` prints no `Validator` line

## MODIFIED Requirements

### Requirement: Stable inbox object
The inbox object SHALL have exactly the top-level array properties `needsYou`,
`running`, and `landed`.

A needs-you item SHALL contain `kind`, `change: { id, title }`, nullable `task`,
and `command`. Its kind SHALL be one of `planning`, `approval`, `task-dead`,
`task-regressed`, `change-regressed`, `change-archived`,
`after-land-failed`, or `validator-failing`; only task kinds
SHALL carry `task: { number, title }`. A `task-dead` item for a stuck task SHALL also carry
`stuck: { fingerprint }`; no other item carries `stuck`. The one item of a
change that needs steering SHALL also carry `steering: { trigger, reason }`; no
other item carries `steering`. An approval item whose
change has steps before approval SHALL also carry `beforeApproval: true`; no
other item carries `beforeApproval`. A `validator-failing` item SHALL also
carry `validatorFailing: { outcome, runs, error }`; no other item carries
`validatorFailing`. A running item SHALL contain `change`,
`task`, numeric `pid`, ISO `startedAt`, integer non-negative `elapsedSeconds`,
and `command`. A landed item SHALL contain `change`, ISO `archivedAt`, and
`command`. A landed item whose tasks disclosed anything SHALL also carry
`disclosures: { deviated, missingContext, outsideScope }`, the number of tasks
with each real section; no other landed item carries `disclosures`. Empty
groups SHALL be empty arrays and JSON output SHALL contain no additional prose
or metadata.

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

#### Scenario: Archived change with after-landing steps
- **WHEN** an archived change has `### After landing` steps and a `check` command
- **THEN** it adds no needs-you item

#### Scenario: Steering field
- **WHEN** a change needs steering because task 1 is blocked, and another change has a `verify_red` dead task that is not stuck
- **THEN** only the first change's item carries `steering`, and the second change's item has the keys `kind`, `change`, `task`, and `command`
