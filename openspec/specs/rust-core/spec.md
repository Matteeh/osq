# rust-core Specification

## Purpose
The pure core of the Rust rewrite of osq: the typed `Event` enum that reads and
writes today's event logs as they are, the folds that turn a change's events
into task and change state, and the typestate gates that only approve and
archive can pass. Core does no IO and depends on nothing else in the
workspace.

## Requirements

### Requirement: Code ownership
<!-- source: crates/core/**, tests/rust-adrs.test.ts, tests/rust-ci.test.ts, tests/rust-verify-script.test.ts, scripts/verify-rust.sh, scripts/mutants-rust.sh, .cargo/mutants.toml, .github/workflows/rust.yml -->
The rust-core capability SHALL own the `osq-core` crate, the Rust decisions
test, and the Rust workspace's scripts, cargo-mutants settings and CI
workflow with their tests.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for the `Event` enum, the folds or the change typestate
- **THEN** system maps `crates/core/**` to rust-core

#### Scenario: Rust decisions test ownership
- **WHEN** file ownership is resolved for `tests/rust-adrs.test.ts`
- **THEN** system maps it to rust-core

#### Scenario: Rust tooling ownership
- **WHEN** file ownership is resolved for `scripts/verify-rust.sh`, `scripts/mutants-rust.sh`, `.cargo/mutants.toml`, `.github/workflows/rust.yml` and `tests/rust-ci.test.ts`
- **THEN** system maps each to rust-core

#### Scenario: Verify script test ownership
- **WHEN** file ownership is resolved for `tests/rust-verify-script.test.ts`
- **THEN** system maps it to rust-core

### Requirement: Core does no IO
The `osq-core` crate SHALL depend only on `serde` and `serde_json` at runtime,
and no file under `crates/core/src/` SHALL name `std::fs`, `std::process`,
`std::env`, `std::net`, `std::thread`, `SystemTime` or `Instant`. Tests and
dev-dependencies are exempt.

#### Scenario: Core source names no IO module
- **WHEN** the `[dependencies]` table of `crates/core/Cargo.toml` and every `.rs` file under `crates/core/src/` are read
- **THEN** the table names exactly `serde` and `serde_json`, and no file contains `std::fs`, `std::process`, `std::env`, `std::net`, `std::thread`, `SystemTime` or `Instant`

### Requirement: Event types
The `Event` enum SHALL have exactly one variant per event type below, the
types today's osq writes to `.run/events/<task>.jsonl`, `change.jsonl` and
`validator.jsonl`. Each variant's data SHALL hold the fields below by their
JSON names, the required ones always and the optional ones only when the line
has them. A field marked `or null` SHALL also accept `null`. A nested object,
or an array of objects, SHALL keep its JSON value as written.

| Type | Required data fields | Optional data fields |
|---|---|---|
| `tool` | `tool`, `summary` | |
| `tokens` | `promptTokens`, `candidateTokens` | `totalTokens`, `cachedTokens`, `reasoningTokens`, `cost`, `provider`, `model` |
| `text` | `text` | |
| `file_changed` | `path` | |
| `started` | | `harness`, `model`, `osqVersion`, `attempt`, `projectCommit` (or null), `commit`, `pid`, `timeoutSeconds`, `version`, `harnessVersion`, `harnessAuth`, `taskTitle`, `tier`, `scope`, `entry`, `skills` |
| `verify_ran` | `command` | `exitCode`, `duration`, `log`, `verifyCommand`, `output`, `phase`, `expected`, `mismatch`, `missingPaths`, `task` |
| `result_written` | `path` | `synthesized` |
| `exited` | `exitCode` | `pid`, `signal`, `timedOut`, `elapsedSeconds` |
| `measures` | `phase`, `scopeFiles`, `scopeLines`, `repoFiles`, `repoLines`, `importFanIn`, `proposalWords`, `taskWords`, `deltaRequirements`, `deltaScenarios` | `scopeResolver`, `changedFiles`, `changedLines`, `scopeHashes`, `dependencies`, `functionHashes` |
| `dependencies_added` | `added` | |
| `done` | `task` | |
| `done_manual` | `task`, `reason` | |
| `dead` | `task`, `reason` | |
| `regressed` | | `task`, `exitCode`, `duration`, `command`, `differingPaths`, `missingPaths`, `reason`, `attribution`, `recordedHash`, `currentHash`, `recordedResolver` (or null), `currentResolver`, `output`, `timedOut`, `verificationPassed` |
| `retry` | `target`, `reason`, `attempt` | `automatic` |
| `stuck` | `task`, `fingerprint` | |
| `harness_retry` | `phase`, `attempt` | `maxAttempts`, `delayMs`, `success`, `error` |
| `recertification` | `task`, `outcome`, `differingPaths`, `attribution`, `command`, `exitCode`, `output`, `timedOut`, `recordedHash`, `currentHash` | `attempt`, `reason`, `automatic` |
| `rejected` | `reason` | |
| `instructions_changed` | `changed` | |
| `baseline_ran` | `outcome`, `command`, `commit` (or null), `treeDigest` (or null), `exitCode`, `durationSeconds` | `reusedFrom`, `output` |
| `focused_ran` | `command`, `files`, `scenarios`, `outcome`, `exitCode`, `duration`, `timedOut`, `output` | |
| `format_ran` | `command`, `files`, `exitCode`, `duration`, `timedOut` | `output` |
| `mutation_ran` | `file`, `function`, `ranges`, `scenarios`, `tests`, `outcome`, `killed`, `survived`, `invalid`, `survivors`, `duration`, `exitCode` (or null) | `reason`, `output` |
| `validator_ran` | `outcome`, `harness`, `model`, `duration`, `exitCode` (or null), `scenarios`, `findings`, `restored` | `reason`, `output` |
| `auto_steer_ran` | `outcome`, `harness`, `model`, `duration`, `exitCode` (or null), `triggers`, `changed`, `restored` | `output` |
| `vcs_violation` | `moved`, `before`, `after` | |
| `scope_violation` | `files` | |
| `usage_limit` | | `resetsAt`, `error` |
| `paused` | `task`, `until`, `source` | `error` |
| `change_verify_rerun` | `rerun`, `tests`, `passed` | |
| `archived` | `archivePath` | `verification` |
| `synced` | `defaultBranch`, `commits`, `duration` | |
| `sync_stopped` | `reason`, `message`, `defaultBranch` | |
| `verification_recorded` | `outcome` | `note` (or null) |

#### Scenario: Every event type parses
- **WHEN** a line `{"type":<type>,"timestamp":"2026-10-17T10:00:00.000Z","data":<data>}` is parsed for each row below
- **THEN** the result is the row's variant with the line's timestamp, and writing it back gives a JSON value equal to the line:

| Type | Data | Variant |
|---|---|---|
| `tool` | `{"tool":"bash","summary":"ls"}` | `Tool` |
| `tokens` | `{"promptTokens":10,"candidateTokens":2}` | `Tokens` |
| `text` | `{"text":"hi"}` | `Text` |
| `file_changed` | `{"path":"crates/core/src/lib.rs"}` | `FileChanged` |
| `started` | `{}` | `Started` |
| `verify_ran` | `{"command":"cargo test"}` | `VerifyRan` |
| `result_written` | `{"path":".run/results/1.md"}` | `ResultWritten` |
| `exited` | `{"exitCode":0}` | `Exited` |
| `measures` | `{"phase":"start","scopeFiles":1,"scopeLines":2,"repoFiles":3,"repoLines":4,"importFanIn":0,"proposalWords":5,"taskWords":6,"deltaRequirements":1,"deltaScenarios":2}` | `Measures` |
| `dependencies_added` | `{"added":[{"file":"Cargo.toml","name":"serde"}]}` | `DependenciesAdded` |
| `done` | `{"task":"1"}` | `Done` |
| `done_manual` | `{"task":"1","reason":"by hand"}` | `DoneManual` |
| `dead` | `{"task":"1","reason":"verify_failed"}` | `Dead` |
| `regressed` | `{"task":"1"}` | `Regressed` |
| `retry` | `{"target":"1","reason":"human","attempt":2}` | `Retry` |
| `stuck` | `{"task":"1","fingerprint":"abc"}` | `Stuck` |
| `harness_retry` | `{"phase":"start","attempt":1}` | `HarnessRetry` |
| `recertification` | `{"task":"1","outcome":"passed","differingPaths":[],"attribution":[],"command":"cargo test","exitCode":0,"output":"","timedOut":false,"recordedHash":"a","currentHash":"b"}` | `Recertification` |
| `rejected` | `{"reason":"wrong idea"}` | `Rejected` |
| `instructions_changed` | `{"changed":["AGENTS.md"]}` | `InstructionsChanged` |
| `baseline_ran` | `{"outcome":"passed","command":"pnpm verify","commit":null,"treeDigest":null,"exitCode":0,"durationSeconds":12}` | `BaselineRan` |
| `focused_ran` | `{"command":"c","files":[],"scenarios":[],"outcome":"passed","exitCode":0,"duration":1,"timedOut":false,"output":""}` | `FocusedRan` |
| `format_ran` | `{"command":"c","files":[],"exitCode":0,"duration":1,"timedOut":false}` | `FormatRan` |
| `mutation_ran` | `{"file":"a.ts","function":"f","ranges":[],"scenarios":[],"tests":[],"outcome":"measured","killed":1,"survived":0,"invalid":0,"survivors":[],"duration":3,"exitCode":null}` | `MutationRan` |
| `validator_ran` | `{"outcome":"validated","harness":"claude","model":"m","duration":5,"exitCode":0,"scenarios":2,"findings":[],"restored":[]}` | `ValidatorRan` |
| `auto_steer_ran` | `{"outcome":"ready","harness":"claude","model":"m","duration":5,"exitCode":null,"triggers":[],"changed":[],"restored":[]}` | `AutoSteerRan` |
| `vcs_violation` | `{"moved":[],"before":{"head":null,"branch":null,"index":"i","stash":[]},"after":{"head":null,"branch":null,"index":"i","stash":[]}}` | `VcsViolation` |
| `scope_violation` | `{"files":["src/a.ts"]}` | `ScopeViolation` |
| `usage_limit` | `{}` | `UsageLimit` |
| `paused` | `{"task":"1","until":"2026-10-17T12:00:00.000Z","source":"harness"}` | `Paused` |
| `change_verify_rerun` | `{"rerun":1,"tests":[],"passed":true}` | `ChangeVerifyRerun` |
| `archived` | `{"archivePath":"openspec/changes/archive/204-rust-core"}` | `Archived` |
| `synced` | `{"defaultBranch":"main","commits":2,"duration":300}` | `Synced` |
| `sync_stopped` | `{"reason":"dirty","message":"m","defaultBranch":"main"}` | `SyncStopped` |
| `verification_recorded` | `{"outcome":"passed"}` | `VerificationRecorded` |

### Requirement: Event lines round-trip
`parse_event_line` SHALL read one JSON line with exactly the keys `type`,
`timestamp` and `data` into an `Envelope` that holds the timestamp as written
and the `Event`. `event_line` SHALL write an `Envelope` back as one JSON line
whose JSON value equals the line it was read from: an optional field absent on
read stays absent, a `null` stays `null`, and a number keeps its value, so `56`
stays `56` and `55.94` stays `55.94`.

#### Scenario: Archived event logs round-trip
- **WHEN** every non-empty line of every `.run/events/*.jsonl` file under `openspec/changes/archive/` is parsed and written back
- **THEN** every line parses, and each written line's JSON value equals the original line's JSON value

#### Scenario: Absent, null and numbers stay as written
- **WHEN** each line below is parsed and written back
- **THEN** the written line's JSON value equals the line:

| Line |
|---|
| `{"type":"regressed","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1"}}` |
| `{"type":"regressed","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","recordedResolver":null}}` |
| `{"type":"started","timestamp":"2026-10-17T10:00:00.000Z","data":{"projectCommit":null}}` |
| `{"type":"verification_recorded","timestamp":"2026-10-17T10:00:00.000Z","data":{"outcome":"passed","note":null}}` |
| `{"type":"verify_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"command":"pnpm verify","exitCode":0,"duration":56}}` |
| `{"type":"verify_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"command":"pnpm verify","exitCode":0,"duration":55.94}}` |
| `{"type":"done","timestamp":"2026-10-17T10:00:00Z","data":{"task":"1"}}` |

### Requirement: Event read errors
`parse_event_line` SHALL refuse a line it cannot read exactly, with an
`EventError` of one of four kinds, and SHALL never skip a line or guess: `NotJson`
when the line is not one JSON object, `InvalidEnvelope` when its keys are not
exactly `type`, `timestamp` and `data` or `type` or `timestamp` is not a
string, `UnknownType` naming the type when `type` is not in the table of
"Event types", and `InvalidData` naming the type when `data` lacks a required
field, holds a field the type does not list, or holds a value of the wrong
JSON kind. Each `EventError` SHALL display as the message of its kind.

#### Scenario: Lines that are refused
- **WHEN** each line below is parsed
- **THEN** the result is the error of its row:

| Line | Error |
|---|---|
| `not json` | `NotJson` |
| `[1,2]` | `NotJson` |
| `{"type":"done","data":{"task":"1"}}` | `InvalidEnvelope` |
| `{"type":"done","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1"},"extra":1}` | `InvalidEnvelope` |
| `{"type":"launched","timestamp":"2026-10-17T10:00:00.000Z","data":{}}` | `UnknownType` naming `launched` |
| `{"type":"done","timestamp":"2026-10-17T10:00:00.000Z","data":{}}` | `InvalidData` naming `done` |
| `{"type":"done","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","extra":true}}` | `InvalidData` naming `done` |
| `{"type":"done","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":1}}` | `InvalidData` naming `done` |

#### Scenario: Read error messages
- **WHEN** each error below is displayed
- **THEN** its text is the message of its row:

| Error | Message |
|---|---|
| `NotJson` | `line is not one JSON object` |
| `InvalidEnvelope` | `line is not a type/timestamp/data envelope` |
| `UnknownType` naming `launched` | ``unknown event type `launched` `` |
| `InvalidData` naming `done` | ``invalid data for event type `done` `` |

### Requirement: Event streams
`Stream::from_file_name` SHALL name the stream an events file holds:
`<n>.jsonl` with a task id `<n>` is that task's stream, `change.jsonl` the
change stream and `validator.jsonl` the validator stream; any other name has
no stream. A `TaskId` SHALL order by its leading number first and then by its
text, as the TypeScript `compareNumericPrefix` does, and SHALL display as its
text.

#### Scenario: File names and task order
- **WHEN** each file name below is read as a stream
- **THEN** the stream is as given:

| File name | Stream |
|---|---|
| `1.jsonl` | task `1` |
| `12.jsonl` | task `12` |
| `change.jsonl` | change |
| `validator.jsonl` | validator |
| `notes.txt` | none |
| `.jsonl` | none |

#### Scenario: Task ids sort by number
- **WHEN** the task ids `10`, `2` and `1` are sorted
- **THEN** the order is `1`, `2`, `10`

#### Scenario: Task ids with one number sort by text
- **WHEN** the task ids `2b`, `10`, `2a` and `1` are sorted
- **THEN** the order is `1`, `2a`, `2b`, `10`

#### Scenario: Task id text
- **WHEN** the task id `12` is displayed
- **THEN** its text is `12`

### Requirement: Task fold
`apply_task(state, &event)` SHALL be a pure function that returns the next
`TaskState` of one task stream: its `TaskStatus` (`Pending`, `Running`,
`Done`, `Dead` or `Regressed`), its attempt number, its last reason, and the
time a pause lasts until. A new task starts `Pending` with attempt 0, no
reason and no pause. The task the stream belongs to is the stream's own, so
the fold reads no `task` field to find it. An event type not in the table
below leaves the state unchanged.

| Event | Next state |
|---|---|
| `started` | `Running`; attempt is `data.attempt` when present, else the attempt before plus 1; the pause is cleared |
| `done`, `done_manual` | `Done`; the reason is cleared |
| `dead` | `Dead`; the reason is `data.reason` |
| `retry` | `Pending`; the reason is `data.reason`; the attempt is unchanged |
| `regressed` | `Regressed`; the reason is `data.reason` when present, else unchanged |
| `recertification` with `outcome` `passed` | `Done`; the reason is cleared |
| `recertification` with `outcome` `requeued` | `Pending`; the reason is `data.reason` when present, else unchanged |
| `paused` | `Pending`; the pause lasts until `data.until` |

#### Scenario: Task transitions
- **WHEN** each event below is applied to the state before it
- **THEN** the state after it is as given:

| State before | Event data | State after |
|---|---|---|
| `Pending`, attempt 0 | `started` `{"attempt":1}` | `Running`, attempt 1 |
| `Pending`, attempt 1 | `started` `{}` | `Running`, attempt 2 |
| `Running`, attempt 1 | `exited` `{"exitCode":0}` | `Running`, attempt 1 |
| `Running`, attempt 1 | `tool` `{"tool":"bash","summary":"ls"}` | `Running`, attempt 1 |
| `Running`, attempt 1 | `done` `{"task":"1"}` | `Done`, attempt 1, no reason |
| `Running`, attempt 1 | `done_manual` `{"task":"1","reason":"by hand"}` | `Done`, attempt 1, no reason |
| `Running`, attempt 1 | `dead` `{"task":"1","reason":"verify_failed"}` | `Dead`, attempt 1, reason `verify_failed` |
| `Dead`, reason `verify_failed` | `stuck` `{"task":"1","fingerprint":"abc"}` | `Dead`, reason `verify_failed` |
| `Dead`, attempt 1, reason `verify_failed` | `retry` `{"target":"1","reason":"human","attempt":2}` | `Pending`, attempt 1, reason `human` |
| `Done`, attempt 1 | `regressed` `{"task":"1","reason":"scope_changed"}` | `Regressed`, attempt 1, reason `scope_changed` |
| `Regressed`, reason `scope_changed` | `recertification` with `outcome` `passed` | `Done`, no reason |
| `Regressed`, reason `scope_changed` | `recertification` with `outcome` `requeued` and `reason` `verify_failed` | `Pending`, reason `verify_failed` |
| `Running`, attempt 1 | `paused` `{"task":"1","until":"2026-10-17T12:00:00.000Z","source":"harness"}` | `Pending`, attempt 1, paused until `2026-10-17T12:00:00.000Z` |
| `Pending`, attempt 1, paused until `2026-10-17T12:00:00.000Z` | `started` `{"attempt":2}` | `Running`, attempt 2, no pause |

#### Scenario: Done clears an earlier reason
- **WHEN** each event below is applied to a `Regressed` task with attempt 1 and reason `scope_changed`
- **THEN** the state after it is as given:

| Event data | State after |
|---|---|
| `done` `{"task":"1"}` | `Done`, attempt 1, no reason |
| `done_manual` `{"task":"1","reason":"by hand"}` | `Done`, attempt 1, no reason |

### Requirement: Change fold
`apply_change(record, &event)` SHALL be a pure function that returns the next
`ChangeRecord` of a change stream: whether the change is regressed, the
archive path once archived, and the reason once rejected. A new record is not
regressed, archived or rejected. `apply(state, &stream, &event)` SHALL return
the next `ChangeState`, which holds the change record and one `TaskState` per
task id: a task stream's event goes to `apply_task` for that task, adding the
task as new when the state lacks it, a change stream's event goes to
`apply_change`, and a validator stream's event leaves the state unchanged. An
event type not in the table below leaves the change record unchanged.

| Event | Next record |
|---|---|
| `regressed` with `task` `change` | regressed |
| `retry` with `target` `change` | not regressed |
| `archived` | archived at `data.archivePath` |
| `rejected` | rejected with `data.reason` |

#### Scenario: Change transitions
- **WHEN** each event below is applied to a new change record
- **THEN** the record after it is as given:

| Event data | Record after |
|---|---|
| `regressed` `{"task":"change","reason":"land_conflict"}` | regressed |
| `archived` `{"archivePath":"openspec/changes/archive/204-rust-core"}` | archived at `openspec/changes/archive/204-rust-core` |
| `rejected` `{"reason":"wrong idea"}` | rejected with `wrong idea` |
| `synced` `{"defaultBranch":"main","commits":2,"duration":300}` | unchanged |
| `verify_ran` `{"command":"cargo test"}` | unchanged |

#### Scenario: Retry clears a change regression
- **WHEN** `retry` `{"target":"change","reason":"human","attempt":1}` is applied to a regressed change record
- **THEN** the record is not regressed

#### Scenario: Task regressions and retries leave the change record
- **WHEN** each event below is applied to the record before it
- **THEN** the record after it is as given:

| Record before | Event data | Record after |
|---|---|---|
| new | `regressed` `{"task":"1","reason":"scope_changed"}` | not regressed |
| regressed | `retry` `{"target":"1","reason":"human","attempt":2}` | regressed |

#### Scenario: Events reach their stream's state
- **WHEN** a change state with tasks `1` and `2` applies `started` `{"attempt":1}` from the task `2` stream, then `regressed` `{"task":"change"}` from the change stream, then `validator_ran` from the validator stream
- **THEN** task `1` is `Pending`, task `2` is `Running` with attempt 1, and the change record is regressed

#### Scenario: An unknown task stream adds its task
- **WHEN** a change state with task `1` applies `started` `{"attempt":1}` from the task `3` stream
- **THEN** the state holds tasks `1` and `3`, and task `3` is `Running` with attempt 1

### Requirement: Fold determinism
Folding the same events in the same order SHALL always give equal states, and
folding a sequence SHALL equal folding its second part onto the fold of its
first part. Applying any event to any state SHALL never panic.

#### Scenario: Any event sequence folds the same way
- **WHEN** a property test folds random sequences of up to 50 events, each one the line of a row of "Every event type parses" applied from a random stream, split at a random point
- **THEN** folding a sequence twice gives equal states, folding the whole sequence equals folding the second part onto the fold of the first part, and no fold panics

### Requirement: Change status
`change_status(approved, &state)` SHALL return the first `ChangeStatus` below
whose condition holds:

| Status | Condition |
|---|---|
| `Rejected` | the change record is rejected |
| `Archived` | the change record is archived |
| `Unapproved` | `approved` is false |
| `Regressed` | the change record is regressed, or some task is `Regressed` |
| `Dead` | some task is `Dead` |
| `Running` | some task is `Running` |
| `Done` | every task is `Done`, including when there are none |
| `Pending` | otherwise |

#### Scenario: Status of a change
- **WHEN** the status is derived for each row below
- **THEN** it is the row's status:

| Approved | Change record | Task statuses | Status |
|---|---|---|---|
| false | new | `Pending` | `Unapproved` |
| false | rejected | `Pending` | `Rejected` |
| true | archived | `Done`, `Done` | `Archived` |
| true | regressed | `Done` | `Regressed` |
| true | new | `Done`, `Regressed` | `Regressed` |
| true | new | `Dead`, `Running` | `Dead` |
| true | new | `Running`, `Pending` | `Running` |
| true | new | `Done`, `Done` | `Done` |
| true | new | none | `Done` |
| true | new | `Done`, `Pending` | `Pending` |

### Requirement: Approval seal
`Seal::parse` SHALL read the text of a `.run/approved` marker, with
surrounding whitespace trimmed, as a `Seal` when it is `sha256:` followed by
exactly 64 lowercase hexadecimal digits, and SHALL refuse anything else with a
`SealError`. A `Seal` SHALL give back its text without the whitespace, and
SHALL display as that text. A `SealError` SHALL display as
``not a seal: expected `sha256:` and 64 lowercase hex digits``.

#### Scenario: Seal texts
- **WHEN** each text below is parsed as a seal
- **THEN** the result is as given:

| Text | Result |
|---|---|
| `sha256:` followed by 64 `a` | a seal with that text |
| `sha256:` followed by 64 `a`, then a newline | a seal with the text without the newline |
| `sha256:` followed by 64 `A` | `SealError` |
| `sha256:` followed by 63 `a` | `SealError` |
| `md5:` followed by 64 `a` | `SealError` |
| empty | `SealError` |

#### Scenario: Seal and seal error text
- **WHEN** the seal parsed from `sha256:` followed by 64 `a` and a newline is displayed, and the `SealError` of the text `md5:` followed by 64 `a` is displayed
- **THEN** the seal's text is `sha256:` followed by 64 `a`, and the error's text is ``not a seal: expected `sha256:` and 64 lowercase hex digits``

### Requirement: Change typestate
A change SHALL be a `Change<S>` whose state type `S` is `Draft`, `Approved` or
`Archived`, holding its id and its task ids. `Change::draft(id, tasks)` SHALL
be the only public constructor. `Change<Draft>::approve(recorded, computed)`
SHALL be the only way to get a `Change<Approved>`, and
`Change<Approved>::archive(&state)` the only way to get a `Change<Archived>`.
`next_task` and `archive` SHALL exist only on `Change<Approved>`, so code that
calls them on a draft, or builds an approved or archived change by hand, does
not compile.

- `approve` SHALL return the approved change holding the seal when `recorded`
  equals `computed`, and `ApproveError::SealMismatch` with both seals
  otherwise.
- `next_task(&state)` SHALL return the lowest pending task id in `TaskId`
  order when `change_status(true, &state)` is `Pending`, and none otherwise.
- `archive(&state)` SHALL return the archived change when
  `change_status(true, &state)` is `Done`, and `ArchiveError::NotDone` with
  that status otherwise.
- `id` and `tasks` SHALL give back the id and the task ids the draft was
  built with, in every state.

#### Scenario: Approve checks the seal
- **WHEN** a draft change is approved with each pair of seals below
- **THEN** the result is as given:

| Recorded | Computed | Result |
|---|---|---|
| `sha256:` followed by 64 `a` | `sha256:` followed by 64 `a` | `Change<Approved>` holding that seal |
| `sha256:` followed by 64 `a` | `sha256:` followed by 64 `b` | `SealMismatch` with both seals |

#### Scenario: Next task of an approved change
- **WHEN** the next task is asked of an approved change with tasks `10`, `2` and `1` in each state below
- **THEN** it is as given:

| Change record | Tasks | Next task |
|---|---|---|
| new | all `Pending` | `1` |
| new | `1` `Done`, `2` and `10` `Pending` | `2` |
| new | `1` `Running`, `2` and `10` `Pending` | none |
| new | `1` `Dead`, `2` and `10` `Pending` | none |
| new | all `Done` | none |
| regressed | all `Pending` | none |

#### Scenario: Archive needs a done change
- **WHEN** an approved change with tasks `1` and `2` is archived in each state below
- **THEN** the result is as given:

| Change record | Tasks | Result |
|---|---|---|
| new | both `Done` | `Change<Archived>` |
| new | `1` `Done`, `2` `Pending` | `NotDone` with `Pending` |
| regressed | both `Done` | `NotDone` with `Regressed` |

#### Scenario: Gates cannot be skipped
- **WHEN** code outside the crate builds a `Change<Approved>` or a `Change<Archived>` without `approve` or `archive`, or calls `next_task` or `archive` on a `Change<Draft>`
- **THEN** it does not compile

#### Scenario: A change keeps its id and tasks
- **WHEN** `Change::draft("204-rust-core", [1, 2])` is read as a draft, then approved with equal seals and read, then archived with both tasks `Done` and read
- **THEN** each time `id` is `204-rust-core` and `tasks` is `1`, `2`

### Requirement: Rust rebuild decisions
osq's decisions SHALL include the five Rust rebuild ADRs 022 to 026, each
accepted, applying to the capability group `rust` through
`applies_to: [group:rust]`, so they govern every capability whose sidecar
names group `rust` and nothing under `src/`, naming `tests/rust-adrs.test.ts`
in its checks, and causing no decision problem. ADR 022 SHALL also name
`crates/core/tests/no_io.rs`, ADR 025 `crates/core/tests/event_corpus.rs`,
and ADR 026 the specs kernel's golden, validation, replay and parity tests
and the linter kernel's no-runtime-Node test. The index SHALL link each
once, and AGENTS.md's project rules block SHALL not change, since none
applies to all.

#### Scenario: Rust ADRs are accepted
- **WHEN** osq's own decisions are read with `readDecisions` and `DEFAULT_CONFIG`
- **THEN** each ADR below is listed and not ignored, with status `accepted`, `appliesTo` `["group:rust"]`, `governs` holding `rust-core`, and the checks of its row, `validateDecisions` reports no error and no warning, and `decisions/README.md` links its file exactly once:

| ADR | File | Checks |
|---|---|---|
| 022 | `022-rust-feature-crates.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/no_io.rs` |
| 023 | `023-rust-code-style.md` | `tests/rust-adrs.test.ts` |
| 024 | `024-rust-link-enforcement.md` | `tests/rust-adrs.test.ts` |
| 025 | `025-rust-on-disk-format.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/event_corpus.rs` |
| 026 | `026-openspec-in-rust.md` | `tests/rust-adrs.test.ts`, `crates/kernel/specs/tests/golden_corpus.rs`, `crates/kernel/specs/tests/validate_corpus.rs`, `crates/kernel/specs/tests/replay_corpus.rs`, `crates/kernel/specs/tests/openspec_validate_parity_corpus.rs`, `crates/kernel/specs/tests/openspec_archive_parity_corpus.rs`, `crates/kernel/linter/tests/node_spawn_corpus.rs` |

#### Scenario: Rules block without the Rust ADRs
- **WHEN** `renderRulesBlock` renders osq's own decisions
- **THEN** no line ends in `ADR 022`, `ADR 023`, `ADR 024`, `ADR 025` or `ADR 026`, and `checkProjectRules` reports nothing

#### Scenario: Rust ADR check files exist
- **WHEN** every check file named by ADRs 022 to 026 is looked up from the repository root
- **THEN** each one exists

### Requirement: Mutation script
`scripts/mutants-rust.sh` SHALL run cargo-mutants over the Rust workspace,
or over only the lines of the diff file its one argument names, keep the
output in a temporary folder outside the source tree, exit 0 when the diff
touches no Rust line, and exit non-zero when a mutant is missed or times out
or the unmutated tests fail. `.cargo/mutants.toml` SHALL hold an
`exclude_re` entry only for a mutant shown to be equivalent, with a comment
saying why.

#### Scenario: rust-core has no missed mutants
- **WHEN** `sh scripts/mutants-rust.sh` runs with no argument on the repository
- **THEN** it exits 0, and the repository holds no `mutants.out` folder afterwards

#### Scenario: Mutation settings exclude nothing
- **WHEN** `.cargo/mutants.toml` is read
- **THEN** it holds no `exclude_re` entry with a pattern in it

### Requirement: Rust CI mutation check
Rust CI SHALL install cargo-mutants 27.1.0 and run `scripts/mutants-rust.sh`
on the diff of each push and pull request to main, and with no argument on a
weekly schedule, so a missed mutant fails the job.

#### Scenario: Rust CI runs the mutation check
- **WHEN** `.github/workflows/rust.yml` is read
- **THEN** it holds each fact below:

| Part | Fact |
|---|---|
| `on` | `push` and `pull_request` on branch `main`, and one `schedule` entry with a `cron` |
| `jobs.cargo` | runs `sh scripts/verify-rust.sh` |
| `jobs.mutants` | checks out with `fetch-depth: 0` |
| `jobs.mutants` | runs `cargo install cargo-mutants --version 27.1.0 --locked` |
| `jobs.mutants` | outside the schedule, writes the diff from the push's or pull request's base to `HEAD` to a file and runs `sh scripts/mutants-rust.sh` with that file |
| `jobs.mutants` | on the schedule, runs `sh scripts/mutants-rust.sh` with no argument |

### Requirement: Verify script mutation step
`scripts/verify-rust.sh` SHALL run the format check, clippy and the
workspace tests with the ignored corpus tests included, then, when `OSQ_DIFF`
is set and not empty, run `sh scripts/mutants-rust.sh "$OSQ_DIFF"` and exit
with its status, so a missed mutant or a timeout in the lines the change
touched fails the verify. When `OSQ_DIFF` is unset or empty, as in Rust CI's
`cargo` job or a run by hand, it SHALL print
`mutation check not run: OSQ_DIFF is not set` and exit 0 after the tests.

#### Scenario: Verify script steps
- **WHEN** `sh scripts/verify-rust.sh` runs with a `cargo` on `PATH` that records its arguments and exits with the status of its row for `mutants` and 0 otherwise
- **THEN** the script runs the cargo commands and exits as given:

| `OSQ_DIFF` | `mutants` status | cargo commands in order | Exit |
|---|---|---|---|
| a diff file | 0 | `fmt --all --check`, `clippy --workspace --all-targets -- -D warnings`, `test --workspace -- --include-ignored`, then `mutants` with `--in-diff` and the diff file's path | 0 |
| a diff file | 2 | the same four | 2 |
| unset | 0 | `fmt --all --check`, `clippy --workspace --all-targets -- -D warnings`, `test --workspace -- --include-ignored` | 0 |
| empty | 0 | the same three | 0 |

#### Scenario: Verify script names the missing diff
- **WHEN** `sh scripts/verify-rust.sh` runs with that recording `cargo` and no `OSQ_DIFF`
- **THEN** its output holds `mutation check not run: OSQ_DIFF is not set`

### Requirement: Corpus tests
A Rust test that reads data outside its own crate, such as the live archive,
SHALL be a corpus test: it lives in a test target `tests/<name>_corpus.rs`,
and every test in it carries `#[ignore = "corpus test: <reason>"]`, so
`scripts/verify-rust.sh` runs it and cargo-mutants does not. A corpus test
that runs the OpenSpec CLI is a parity test: its test target needs its
crate's `parity` feature, so `scripts/verify-rust.sh` does not build it, and
the Rust CI `parity` job runs it. Each requirement a corpus test proves SHALL
also have a fast test on the crate's own fixtures, which cargo-mutants runs.

#### Scenario: Corpus tests are marked
- **WHEN** every `crates/**/tests/*_corpus.rs` file is read
- **THEN** there is at least one, and every function marked `#[test]` in them also carries an `#[ignore = "corpus test: ` attribute

#### Scenario: Verify runs corpus tests
- **WHEN** `scripts/verify-rust.sh` is read
- **THEN** it holds the line `cargo test --workspace -- --include-ignored`

### Requirement: Rust CI parity job
Rust CI SHALL run the specs kernel's OpenSpec parity tests in a `parity`
job of `.github/workflows/rust.yml`: against the pinned OpenSpec CLI that
`pnpm install --frozen-lockfile` installs, on each push and pull request
to main, and against `@fission-ai/openspec@latest`, installed outside the
lockfile, on the workflow's weekly schedule. A failure on the schedule
means osq and upstream OpenSpec have diverged.

#### Scenario: Rust CI runs the parity tests
- **WHEN** `.github/workflows/rust.yml` is read
- **THEN** its `parity` job holds each fact below:

| Fact |
|---|
| uses `actions/checkout@`, `pnpm/action-setup@`, `actions/setup-node@` with `node-version` 24, `dtolnay/rust-toolchain@` and `Swatinem/rust-cache@` |
| runs `pnpm install --frozen-lockfile` |
| runs `cargo clippy -p osq-kernel-specs --features parity --all-targets -- -D warnings` |
| outside the schedule, runs `cargo test -p osq-kernel-specs --features parity --test openspec_validate_parity_corpus --test openspec_archive_parity_corpus -- --include-ignored` with no `OSQ_OPENSPEC_BIN` |
| on the schedule, runs `npm install --prefix "$RUNNER_TEMP/openspec-latest" @fission-ai/openspec@latest`, then the same `cargo test` with `OSQ_OPENSPEC_BIN` set to the `openspec` binary under `openspec-latest/node_modules/.bin/` and `OPENSPEC_TELEMETRY` set to `0` |
| never runs `pnpm add` or `pnpm update` |
