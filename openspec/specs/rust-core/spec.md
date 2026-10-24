# rust-core Specification

## Purpose
The pure core of the Rust rewrite of osq: the typed `Event` enum that reads and
writes today's event logs as they are, the folds that turn a change's events
into task and change state, and the typestate gates that only approve and
archive can pass. Core does no IO and depends on nothing else in the
workspace.

## Requirements

### Requirement: Code ownership
<!-- source: crates/core/**, tests/rust-adrs.test.ts, tests/rust-ci.test.ts, tests/rust-verify-script.test.ts, scripts/verify-rust.sh, scripts/mutants-rust.sh, .cargo/mutants.toml, .github/workflows/rust.yml, rust-toolchain.toml -->
The rust-core capability SHALL own the `osq-core` crate, the Rust decisions
test, and the Rust workspace's toolchain file, scripts, cargo-mutants
settings and CI workflow with their tests.

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

#### Scenario: Toolchain file ownership
- **WHEN** file ownership is resolved for `rust-toolchain.toml`
- **THEN** system maps it to rust-core

### Requirement: Core does no IO
The `osq-core` crate SHALL depend only on `serde`, `serde_json` and `sha2` at
runtime, and no file under `crates/core/src/` SHALL name `std::fs`,
`std::process`, `std::env`, `std::net`, `std::thread`, `SystemTime` or
`Instant`. Tests and dev-dependencies are exempt.

#### Scenario: Core source names no IO module
- **WHEN** the `[dependencies]` table of `crates/core/Cargo.toml` and every `.rs` file under `crates/core/src/` are read
- **THEN** the table names exactly `serde`, `serde_json` and `sha2`, and no file contains `std::fs`, `std::process`, `std::env`, `std::net`, `std::thread`, `SystemTime` or `Instant`

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
| `exit_continued` | `exitCode` | |
| `measures` | `phase`, `scopeFiles`, `scopeLines`, `repoFiles`, `repoLines`, `importFanIn`, `proposalWords`, `taskWords`, `deltaRequirements`, `deltaScenarios` | `scopeResolver`, `changedFiles`, `changedLines`, `scopeHashes`, `dependencies`, `functionHashes` |
| `dependencies_added` | `added` | |
| `done` | `task` | |
| `done_manual` | `task`, `reason` | |
| `dead` | `task`, `reason` | |
| `regressed` | | `task`, `exitCode`, `duration`, `command`, `differingPaths`, `missingPaths`, `reason`, `attribution`, `recordedHash`, `currentHash`, `recordedResolver` (or null), `currentResolver`, `output`, `timedOut`, `verificationPassed` |
| `retry` | `target`, `reason`, `attempt` | `automatic` |
| `stuck` | `task`, `fingerprint` | |
| `harness_retry` | `phase`, `attempt` | `maxAttempts`, `delayMs`, `success`, `error` |
| `recertification` | `task`, `outcome`, `differingPaths`, `attribution`, `command`, `exitCode`, `timedOut`, `recordedHash`, `currentHash` | `output`, `attempt`, `reason`, `automatic` |
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

Each field below SHALL hold its enum, not a string. The enum's variants are
exactly the values in the table of "Reason and outcome values", the codes
TypeScript writes. Each variant SHALL read from and write back as its string.
Each enum SHALL list every variant in a constant `ALL`, in the table's order,
and `as_str` SHALL give a variant's string. A new value is a spec change.
The `reason` of `done_manual` and `rejected` stays free text.

| Field | Enum |
|---|---|
| `dead` `reason` | `DeadReason` |
| `regressed` `reason` | `RegressionReason` |
| `retry` `reason` | `FailureReason` |
| `recertification` `outcome` | `RecertificationOutcome` |
| `recertification` `reason` | `RequeueReason` |
| `baseline_ran` `outcome` | `BaselineOutcome` |
| `focused_ran` `outcome` | `FocusedOutcome` |
| `mutation_ran` `outcome` | `MutationOutcome` |
| `mutation_ran` `reason` | `MutationReason` |
| `validator_ran` `outcome` | `ValidatorOutcome` |
| `validator_ran` `reason` | `ValidatorReason` |
| `auto_steer_ran` `outcome` | `AutoSteerOutcome` |
| `sync_stopped` `reason` | `SyncStopReason` |
| `verification_recorded` `outcome` | `VerificationOutcome` |

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
| `exit_continued` | `{"exitCode":1}` | `ExitContinued` |
| `measures` | `{"phase":"start","scopeFiles":1,"scopeLines":2,"repoFiles":3,"repoLines":4,"importFanIn":0,"proposalWords":5,"taskWords":6,"deltaRequirements":1,"deltaScenarios":2}` | `Measures` |
| `dependencies_added` | `{"added":[{"file":"Cargo.toml","name":"serde"}]}` | `DependenciesAdded` |
| `done` | `{"task":"1"}` | `Done` |
| `done_manual` | `{"task":"1","reason":"by hand"}` | `DoneManual` |
| `dead` | `{"task":"1","reason":"verify_red"}` | `Dead` |
| `regressed` | `{"task":"1"}` | `Regressed` |
| `retry` | `{"target":"1","reason":"verify_red","attempt":2}` | `Retry` |
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
| `sync_stopped` | `{"reason":"sync_conflict","message":"m","defaultBranch":"main"}` | `SyncStopped` |
| `verification_recorded` | `{"outcome":"passed"}` | `VerificationRecorded` |

#### Scenario: Reason and outcome values
- **WHEN** each enum's `ALL` is read
- **THEN** the `as_str` of its variants, in order, are exactly the row's values, and each variant writes as that JSON string and reads back from it as the same variant:

| Enum | Values, in order |
|---|---|
| `DeadReason` | `spec_conflict`, `already_running`, `no_result`, `verify_red`, `verify_precondition`, `verify_path_missing`, `entry_missing`, `denied_dependency`, `change_verify_red`, `crashed`, `timeout`, `provider_unavailable`, `undeclared_test_change`, `blocked`, `baseline_red`, `regressed`, `vcs_violation`, `scope_violation` |
| `RegressionReason` | `verify_red`, `verify_path_missing`, `scope_regression`, `worktree_off_branch`, `worktree_dirty`, `commit_failed`, `dependency_changed`, `dependency_diverged`, `stack_cut_failed`, `sync_conflict`, `requirement_changed`, `sync_verify_red`, `sync_failed` |
| `FailureReason` | `spec_conflict`, `already_running`, `no_result`, `verify_red`, `verify_precondition`, `verify_path_missing`, `entry_missing`, `denied_dependency`, `change_verify_red`, `crashed`, `timeout`, `provider_unavailable`, `undeclared_test_change`, `blocked`, `baseline_red`, `regressed`, `vcs_violation`, `scope_violation`, `scope_regression`, `worktree_off_branch`, `worktree_dirty`, `commit_failed`, `dependency_changed`, `dependency_diverged`, `stack_cut_failed`, `sync_conflict`, `requirement_changed`, `sync_verify_red`, `sync_failed`, `dead` |
| `RequeueReason` | `scope_regression` |
| `MutationReason` | `range_unknown`, `timed_out`, `command_failed`, `report_invalid`, `budget` |
| `ValidatorReason` | `no_base`, `no_scenarios` |
| `SyncStopReason` | `sync_conflict`, `requirement_changed`, `sync_verify_red`, `sync_failed` |
| `RecertificationOutcome` | `passed`, `requeued` |
| `BaselineOutcome` | `passed`, `failed`, `reused` |
| `FocusedOutcome` | `passed`, `problem`, `failed` |
| `MutationOutcome` | `measured`, `not_measured` |
| `ValidatorOutcome` | `validated`, `failed`, `timed_out`, `unreadable`, `not_run` |
| `AutoSteerOutcome` | `running`, `ready`, `unchanged`, `lint_red`, `failed`, `timed_out` |
| `VerificationOutcome` | `passed`, `failed` |

### Requirement: Event lines round-trip
`parse_event_line` SHALL read one JSON line with exactly the keys `type`,
`timestamp` and `data` into an `Envelope` that holds the timestamp as written
and the `Event`. `event_line` SHALL write an `Envelope` back as one JSON line
whose JSON value equals the line it was read from: an optional field absent on
read stays absent, a `null` stays `null`, and a number keeps its value, so `56`
stays `56` and `55.94` stays `55.94`.

#### Scenario: Archived event logs round-trip
- **WHEN** every non-empty line of every `.run/events/*.jsonl` file of each change folder directly under `openspec/changes/archive/` is parsed and written back
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

#### Scenario: Sync recertification without output
- **WHEN** the line `{"type":"recertification","timestamp":"2026-10-21T13:15:02.371Z","data":{"task":"2","outcome":"passed","differingPaths":["Cargo.lock (modified)"],"attribution":[{"path":"Cargo.lock (modified)","attribution":"sync"}],"command":"cargo test -p osq-kernel-harnesses","exitCode":0,"timedOut":false,"recordedHash":"sha256:b7","currentHash":"sha256:3d","automatic":true}`, which TypeScript's sync recertification writes, is parsed and written back
- **THEN** it parses to `Event::Recertification` with outcome `passed`, no `output` and `automatic` `true`, and the written line's JSON value equals the line and holds no `output` key

### Requirement: Event read errors
`parse_event_line` SHALL refuse a line it cannot read exactly, with an
`EventError` of one of four kinds, and SHALL never skip a line or guess: `NotJson`
when the line is not one JSON object, `InvalidEnvelope` when its keys are not
exactly `type`, `timestamp` and `data` or `type` or `timestamp` is not a
string, `UnknownType` naming the type when `type` is not in the table of
"Event types", and `InvalidData` naming the type when `data` lacks a required
field, holds a field the type does not list, holds a value of the wrong
JSON kind, or holds a reason or outcome string outside its enum's values in
"Reason and outcome values", compared byte for byte. Each `EventError` SHALL
display as the message of its kind.

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

#### Scenario: Values outside their set are refused
- **WHEN** each line below is parsed
- **THEN** the result is `InvalidData` naming the row's type:

| Line | Type |
|---|---|
| `{"type":"dead","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","reason":"verify_failed"}}` | `dead` |
| `{"type":"dead","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","reason":" verify_red "}}` | `dead` |
| `{"type":"dead","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","reason":""}}` | `dead` |
| `{"type":"retry","timestamp":"2026-10-17T10:00:00.000Z","data":{"target":"1","reason":"human","attempt":2}}` | `retry` |
| `{"type":"regressed","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","reason":"scope_changed"}}` | `regressed` |
| `{"type":"baseline_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"outcome":"green","command":"pnpm verify","commit":null,"treeDigest":null,"exitCode":0,"durationSeconds":12}}` | `baseline_ran` |
| `{"type":"sync_stopped","timestamp":"2026-10-17T10:00:00.000Z","data":{"reason":"dirty","message":"m","defaultBranch":"main"}}` | `sync_stopped` |
| `{"type":"verification_recorded","timestamp":"2026-10-17T10:00:00.000Z","data":{"outcome":"Passed"}}` | `verification_recorded` |

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
below leaves the state unchanged. The reason SHALL be a `FailureReason`:
every `DeadReason`, `RegressionReason` and `RequeueReason` converts into the
`FailureReason` with the same string through `From`. The fold SHALL match
every `RecertificationOutcome` by name, with no catch-all arm.

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
| `Running`, attempt 1 | `dead` `{"task":"1","reason":"verify_red"}` | `Dead`, attempt 1, reason `verify_red` |
| `Dead`, reason `verify_red` | `stuck` `{"task":"1","fingerprint":"abc"}` | `Dead`, reason `verify_red` |
| `Dead`, attempt 1, reason `verify_red` | `retry` `{"target":"1","reason":"verify_red","attempt":2}` | `Pending`, attempt 1, reason `verify_red` |
| `Done`, attempt 1 | `regressed` `{"task":"1","reason":"scope_regression"}` | `Regressed`, attempt 1, reason `scope_regression` |
| `Regressed`, reason `scope_regression` | `recertification` with `outcome` `passed` | `Done`, no reason |
| `Regressed`, reason `worktree_dirty` | `recertification` with `outcome` `requeued` and `reason` `scope_regression` | `Pending`, reason `scope_regression` |
| `Running`, attempt 1 | `paused` `{"task":"1","until":"2026-10-17T12:00:00.000Z","source":"harness"}` | `Pending`, attempt 1, paused until `2026-10-17T12:00:00.000Z` |
| `Pending`, attempt 1, paused until `2026-10-17T12:00:00.000Z` | `started` `{"attempt":2}` | `Running`, attempt 2, no pause |

#### Scenario: Done clears an earlier reason
- **WHEN** each event below is applied to a `Regressed` task with attempt 1 and reason `scope_regression`
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
A `ChangeState`'s fields SHALL be private: `record()` and `tasks()` read
them, and a state SHALL come only from `ChangeState::new` and `apply`.

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
| `regressed` `{"task":"change","reason":"sync_conflict"}` | regressed |
| `archived` `{"archivePath":"openspec/changes/archive/204-rust-core"}` | archived at `openspec/changes/archive/204-rust-core` |
| `rejected` `{"reason":"wrong idea"}` | rejected with `wrong idea` |
| `synced` `{"defaultBranch":"main","commits":2,"duration":300}` | unchanged |
| `verify_ran` `{"command":"cargo test"}` | unchanged |

#### Scenario: Retry clears a change regression
- **WHEN** `retry` `{"target":"change","reason":"worktree_dirty","attempt":1}` is applied to a regressed change record
- **THEN** the record is not regressed

#### Scenario: Task regressions and retries leave the change record
- **WHEN** each event below is applied to the record before it
- **THEN** the record after it is as given:

| Record before | Event data | Record after |
|---|---|---|
| new | `regressed` `{"task":"1","reason":"scope_regression"}` | not regressed |
| regressed | `retry` `{"target":"1","reason":"verify_red","attempt":2}` | regressed |

#### Scenario: Events reach their stream's state
- **WHEN** a change state with tasks `1` and `2` applies `started` `{"attempt":1}` from the task `2` stream, then `regressed` `{"task":"change"}` from the change stream, then `validator_ran` from the validator stream
- **THEN** task `1` is `Pending`, task `2` is `Running` with attempt 1, and the change record is regressed

#### Scenario: An unknown task stream adds its task
- **WHEN** a change state with task `1` applies `started` `{"attempt":1}` from the task `3` stream
- **THEN** the state holds tasks `1` and `3`, and task `3` is `Running` with attempt 1

#### Scenario: Folded state reads back
- **WHEN** `ChangeState::new([1])` applies `started` `{"attempt":1}` from the task `1` stream, then `archived` `{"archivePath":"openspec/changes/archive/204-rust-core"}` from the change stream
- **THEN** `tasks()` holds only task `1`, `Running` with attempt 1, and `record()` is archived at `openspec/changes/archive/204-rust-core`, not regressed and not rejected

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
`approve` SHALL take `recorded` as a `Seal` and `computed` as a
`ComputedSeal`, which only `compute_seal` creates, so approving without
hashing does not compile. `next_task` and `archive` SHALL exist only on
`Change<Approved>`, so code that calls them on a draft, or builds an approved
or archived change by hand, does not compile.

- `approve` SHALL return the approved change holding the seal when `recorded`
  equals the computed seal, and `ApproveError::SealMismatch` with the
  recorded seal and the computed seal as a `Seal` otherwise.
- `next_task(&state)` SHALL return the lowest pending task id in `TaskId`
  order when `change_status(true, &state)` is `Pending`, and none otherwise.
- `archive(&state)` SHALL return the archived change when
  `change_status(true, &state)` is `Done`, and `ArchiveError::NotDone` with
  that status otherwise.
- `id` and `tasks` SHALL give back the id and the task ids the draft was
  built with, in every state.

#### Scenario: Approve checks the seal
- **WHEN** a draft change is approved with each recorded seal below, and as the computed seal `compute_seal` of the one entry `proposal.md`: `a\n`, which is `sha256:0dde7716d600b92d32148bafc60a3111581ee9c4836ae6925c584dcaac2ab9bd`
- **THEN** the result is as given:

| Recorded | Result |
|---|---|
| `sha256:0dde7716d600b92d32148bafc60a3111581ee9c4836ae6925c584dcaac2ab9bd` | `Change<Approved>` holding that seal |
| `sha256:` followed by 64 `a` | `SealMismatch` with the recorded seal and `sha256:0dde7716d600b92d32148bafc60a3111581ee9c4836ae6925c584dcaac2ab9bd` |

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
- **WHEN** code outside the crate builds a `Change<Approved>` or a `Change<Archived>` without `approve` or `archive`, calls `next_task` or `archive` on a `Change<Draft>`, passes a `Seal` as the computed seal of `approve`, builds a `ComputedSeal` by hand, builds a `ChangeState` by hand, or writes a `ChangeState`'s record or tasks
- **THEN** it does not compile

#### Scenario: A change keeps its id and tasks
- **WHEN** `Change::draft("204-rust-core", [1, 2])` is read as a draft, then approved with the seal `compute_seal` gives for its entries as both the recorded and the computed seal and read, then archived with both tasks `Done` and read
- **THEN** each time `id` is `204-rust-core` and `tasks` is `1`, `2`

### Requirement: Rust rebuild decisions
osq's decisions SHALL include the nine Rust rebuild ADRs 022 to 030, each
accepted, applying to the capability group `rust` through
`applies_to: [group:rust]`, so they govern every capability whose sidecar
names group `rust` and nothing under `src/`, naming `tests/rust-adrs.test.ts`
in its checks, and causing no decision problem. ADR 022 SHALL also name
`crates/core/tests/no_io.rs`, ADR 024 the linter kernel's link gate
tests, ADR 025 `crates/core/tests/event_corpus.rs`, and ADR 026 the specs
kernel's golden, validation, replay and parity tests and the linter
kernel's no-runtime-Node test. ADR 027, scheduling, SHALL also name core's
scheduler tests and the loop kernel's scope, schedule and corpus tests.
ADR 028, the Feature trait, SHALL also name core's feature test.
ADR 029, config, SHALL also name the config kernel's file and role tests.
ADR 030, feature events, SHALL also name core's reaction test, the loop
kernel's delivery test and the storage kernel's durable write test.
The index SHALL link each once, and AGENTS.md's project rules block SHALL
not change, since none applies to all.

#### Scenario: Rust ADRs are accepted
- **WHEN** osq's own decisions are read with `readDecisions` and `DEFAULT_CONFIG`
- **THEN** each ADR below is listed and not ignored, with status `accepted`, `appliesTo` `["group:rust"]`, `governs` holding `rust-core`, and the checks of its row, `validateDecisions` reports no error and no warning, and `decisions/README.md` links its file exactly once:

| ADR | File | Checks |
|---|---|---|
| 022 | `022-rust-feature-crates.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/no_io.rs` |
| 023 | `023-rust-code-style.md` | `tests/rust-adrs.test.ts` |
| 024 | `024-rust-link-enforcement.md` | `tests/rust-adrs.test.ts`, `crates/kernel/linter/tests/link_gates.rs`, `crates/kernel/linter/tests/link_gates_corpus.rs` |
| 025 | `025-rust-on-disk-format.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/event_corpus.rs` |
| 026 | `026-openspec-in-rust.md` | `tests/rust-adrs.test.ts`, `crates/kernel/specs/tests/golden_corpus.rs`, `crates/kernel/specs/tests/validate_corpus.rs`, `crates/kernel/specs/tests/replay_corpus.rs`, `crates/kernel/specs/tests/openspec_validate_parity_corpus.rs`, `crates/kernel/specs/tests/openspec_archive_parity_corpus.rs`, `crates/kernel/linter/tests/node_spawn_corpus.rs` |
| 027 | `027-rust-scheduling.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/schedule.rs`, `crates/core/tests/schedule_props.rs`, `crates/kernel/loop/tests/scope_files.rs`, `crates/kernel/loop/tests/active_schedule.rs`, `crates/kernel/loop/tests/schedule_corpus.rs` |
| 028 | `028-rust-feature-trait.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/feature.rs` |
| 029 | `029-rust-config.md` | `tests/rust-adrs.test.ts`, `crates/kernel/config/tests/config_file.rs`, `crates/kernel/config/tests/roles.rs` |
| 030 | `030-rust-feature-events.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/feature_reactions.rs`, `crates/kernel/loop/tests/delivery.rs`, `crates/kernel/storage/tests/durable_write.rs` |

#### Scenario: Rules block without the Rust ADRs
- **WHEN** `renderRulesBlock` renders osq's own decisions
- **THEN** no line ends in `ADR 022`, `ADR 023`, `ADR 024`, `ADR 025`, `ADR 026`, `ADR 027`, `ADR 028`, `ADR 029` or `ADR 030`, and `checkProjectRules` reports nothing

#### Scenario: Rust ADR check files exist
- **WHEN** every check file named by ADRs 022 to 030 is looked up from the repository root
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
- **WHEN** `sh scripts/verify-rust.sh` runs with a `cargo` on `PATH` that prints `cargo 1.99.1 (stub)` for `--version`, records its other arguments and exits with the status of its row for `mutants` and 0 otherwise
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
| uses `actions/checkout@`, `pnpm/action-setup@`, `actions/setup-node@` with `node-version` 24 and `Swatinem/rust-cache@`, and runs `rustup toolchain install` |
| runs `pnpm install --frozen-lockfile` |
| runs `cargo clippy -p osq-kernel-specs --features parity --all-targets -- -D warnings` |
| outside the schedule, runs `cargo test -p osq-kernel-specs --features parity --test openspec_validate_parity_corpus --test openspec_archive_parity_corpus -- --include-ignored` with no `OSQ_OPENSPEC_BIN` |
| on the schedule, runs `npm install --prefix "$RUNNER_TEMP/openspec-latest" @fission-ai/openspec@latest`, then the same `cargo test` with `OSQ_OPENSPEC_BIN` set to the `openspec` binary under `openspec-latest/node_modules/.bin/` and `OPENSPEC_TELEMETRY` set to `0` |
| never runs `pnpm add` or `pnpm update` |

### Requirement: Seal computation
`compute_seal` SHALL give, without IO, the seal that `hashChangeFolder`
gives for a folder holding exactly the given entries of relative path and
bytes, as a `ComputedSeal`. Content SHALL be decoded as JavaScript decodes UTF-8, with CRLF turned
into LF and, in `tasks.md` alone, checkboxes reset as `normalizeTasksMd` does.
Entries SHALL be ordered by path in UTF-16 code unit order. `compute_seal`
SHALL be the only way to get a `ComputedSeal`, whose `as_str` gives the
seal's text and whose `seal` gives it as a `Seal`.

#### Scenario: Seals of entries
- **WHEN** `compute_seal` runs on the entries of each row below, written as `path`: content
- **THEN** the seal is as given:

| Entries | Seal |
|---|---|
| none | `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `proposal.md`: `a\n` | `sha256:0dde7716d600b92d32148bafc60a3111581ee9c4836ae6925c584dcaac2ab9bd` |
| `a.md`: `x\r\ny\r\n` | `sha256:84e73026f37063934c900dfa2c1ecf3f8fdebffc3b1483d78a2275a21b248241` |
| `a.md`: `x\ny\n` | `sha256:84e73026f37063934c900dfa2c1ecf3f8fdebffc3b1483d78a2275a21b248241` |
| `tasks.md`: `- [x] 1. a\n  - [X] 2. b\n` | `sha256:c66367cc16aa800f014845d20689fc87356ebee7053a9dfd46653693529a011a` |
| `tasks.md`: `- [ ] 1. a\n  - [ ] 2. b\n` | `sha256:c66367cc16aa800f014845d20689fc87356ebee7053a9dfd46653693529a011a` |
| `notes/tasks.md`: `- [x] 1. a\n` | `sha256:fa65172b5ab5cee5da25838e4c968ded29d7a4837aa65283758225af2586088f` |
| `tasks.md`: U+00A0 then `- [x] a\n` | `sha256:ba2854b7aadd6685d64d1624f7b144e4b5e5d69e017060244b846491ef0b304b` |
| `tasks.md`: U+0085 then `- [x] a\n` | `sha256:52902fea6a1daefdb3316706390ca2fc5a816709f0eb28a514aacc0a31f007d0` |
| `b.bin`: the bytes `FF FE 41` | `sha256:f2859d36ed56daac01133dde3da6a05522a65da80d2fe1659fd1cf64716c8ac8` |

#### Scenario: JavaScript path order
- **WHEN** `compute_seal` runs on `a-｡.md` (U+FF61): `2\n` and `a-😀.md` (U+1F600): `1\n`, given in that order and again in the reverse order
- **THEN** both seals are `sha256:f47bbfc7ba5286ec24f4ddf82d9bf58771d785ef0b0806c45b8e4ca2ff469938`, the seal of UTF-16 order, and neither is `sha256:e5c08cd78230313694389dde3ad3ff879ccbdf90e1e3c5b738ea76dcf9328e79`, the seal of byte order

#### Scenario: Computed seal reads back
- **WHEN** `compute_seal` runs on the one entry `proposal.md`: `a\n`
- **THEN** its `as_str` is `sha256:0dde7716d600b92d32148bafc60a3111581ee9c4836ae6925c584dcaac2ab9bd`, and its `seal` equals `Seal::parse` of that text

### Requirement: Pinned Rust toolchain
`rust-toolchain.toml` SHALL pin Rust `1.99.1` with the `clippy` and
`rustfmt` components, so a run by hand, the watcher's verify and CI lint
with the same clippy. Every job of `.github/workflows/rust.yml` SHALL
install it with `rustup toolchain install`, which reads the file, before
any step that uses cargo, and SHALL name no Rust version itself. A newer
Rust is a change that edits this requirement and fixes what clippy raises.

#### Scenario: Rust toolchain is pinned once
- **WHEN** `rust-toolchain.toml` and `.github/workflows/rust.yml` are read
- **THEN** they hold each fact below:

| Part | Fact |
|---|---|
| `rust-toolchain.toml` | its `[toolchain]` table sets `channel = "1.99.1"` |
| `rust-toolchain.toml` | its `components` list holds `clippy` and `rustfmt` |
| `jobs.cargo`, `jobs.mutants` and `jobs.parity` | each has one step whose `run` is exactly `rustup toolchain install` |
| `jobs.cargo`, `jobs.mutants` and `jobs.parity` | that step comes before the `Swatinem/rust-cache@` step and before every step whose `run` holds `cargo` or `sh scripts/` |
| every job | no step uses `dtolnay/rust-toolchain@`, and no step has a `toolchain` key under `with` |

### Requirement: Verify script toolchain check
Before any other cargo command, `scripts/verify-rust.sh` SHALL compare
the version that `cargo --version` prints, its second word, with the
`channel` of `rust-toolchain.toml`. When they differ, it SHALL print
`cargo <found> is on PATH, but rust-toolchain.toml pins <pinned>; put rustup's cargo proxy first on PATH`
to standard error and exit 1 without running another cargo command, so a
`cargo` that ignores the toolchain file cannot lint with a different
clippy.

#### Scenario: Verify script refuses another toolchain
- **WHEN** `sh scripts/verify-rust.sh` runs with no `OSQ_DIFF` and a `cargo` on `PATH` that prints its row's text for `--version`, records its other arguments and exits 0
- **THEN** the script exits, prints and runs the cargo commands as given:

| `cargo --version` prints | Exit | Output holds | cargo commands after `--version` |
|---|---|---|---|
| `cargo 1.99.1 (stub)` | 0 | `mutation check not run: OSQ_DIFF is not set` | `fmt --all --check`, `clippy --workspace --all-targets -- -D warnings`, `test --workspace -- --include-ignored` |
| `cargo 1.99.0 (stub)` | 1 | `cargo 1.99.0 is on PATH, but rust-toolchain.toml pins 1.99.1; put rustup's cargo proxy first on PATH` | none |
| `cargo 1.97.0 (stub)` | 1 | `cargo 1.97.0 is on PATH, but rust-toolchain.toml pins 1.99.1; put rustup's cargo proxy first on PATH` | none |

### Requirement: Link graph
`osq-core` SHALL hold ADR 024's link graph as plain data, with no IO, in
its `graph` module. A `NodeId` is one of `Adr`, `Capability`, `Group`,
`Requirement`, `Scenario`, `File`, `Item`, `Test` and `Change`, in that
order, each holding one text key, and node ids order by that variant
order and then by the key's bytes. An id displays as its kind's prefix, a
colon and its key. A `Location` holds a `file` and an optional 1-based
`line`, and displays as `<file>:<line>`, or as `<file>` without a line. A
`Node` holds its `id`, its `name`, an optional `location`, an optional
`status`, which an ADR node sets to the ADR's status, `public`, which
an item node sets when the item is public, and `function`, which an item
or test node sets when the item is a function. An `EdgeKind` is one of
`applies_to`, `governs`, `owns`, `implements`, `covers`, `reads`,
`writes`, `supersedes` and `departs`, and `as_str` gives that name. An
`Edge` holds its `kind`, its `from` and `to` ids and an optional
`location`, the place in the files that states it.

A `Graph` starts empty. `add_node` adds a node and returns true, or, when
a node with that id is already there, keeps the first node and returns
false. `add_edge` keeps every edge in the order it was added, even when
an end names no node or the same edge was added before. `node` finds a
node by id, `nodes` lists the nodes in id order, `edges` lists every edge
in added order, and `edges_of`, `edges_from` and `edges_to` list, in
added order, the edges of one kind, from one id and to one id. `dangling`
lists, in added order, every edge whose `from` or `to` names no node, so a
rule can report a tag that names something missing.

#### Scenario: Node id display
- **WHEN** each node id below is displayed
- **THEN** it reads as given, and the ids sort in the order of the table:

| Id | Display |
|---|---|
| `Adr("024")` | `adr:024` |
| `Capability("rust-core")` | `capability:rust-core` |
| `Group("rust")` | `group:rust` |
| `Requirement("rust-core/link-graph")` | `requirement:rust-core/link-graph` |
| `Scenario("rust-core/node-id-display")` | `scenario:rust-core/node-id-display` |
| `File("crates/core/src/lib.rs")` | `file:crates/core/src/lib.rs` |
| `Item("crates/core/src/seal.rs::compute_seal")` | `item:crates/core/src/seal.rs::compute_seal` |
| `Test("crates/core/tests/fold.rs::folds")` | `test:crates/core/tests/fold.rs::folds` |
| `Change("231")` | `change:231` |

#### Scenario: Edge kind names
- **WHEN** `as_str` is read for each edge kind
- **THEN** the kinds give, in order, `applies_to`, `governs`, `owns`, `implements`, `covers`, `reads`, `writes`, `supersedes` and `departs`

#### Scenario: Location display
- **WHEN** each location below is displayed
- **THEN** it reads as given:

| File | Line | Display |
|---|---|---|
| `src/lib.rs` | 3 | `src/lib.rs:3` |
| `decisions/001-a.md` | none | `decisions/001-a.md` |

#### Scenario: Graph queries
- **WHEN** an empty graph gets the nodes `capability:a` named `a`, `item:src/lib.rs::f` named `f` and `requirement:a/one` named `One`, then a second node `capability:a` named `other`, then these edges in order: implements `item:src/lib.rs::f` to `requirement:a/one` at `src/lib.rs:3`, implements `item:src/lib.rs::f` to `requirement:a/two` at `src/lib.rs:4`, owns `capability:a` to `file:src/lib.rs`, and implements `item:src/lib.rs::f` to `requirement:a/one` at `src/lib.rs:3` again
- **THEN** the first three `add_node` calls return true and the fourth returns false, `node` of `capability:a` is named `a`, `node` of `file:src/lib.rs` is none, and the queries give:

| Query | Result |
|---|---|
| `nodes` | `capability:a`, `requirement:a/one`, `item:src/lib.rs::f` |
| `edges` | the four edges, in added order |
| `edges_of(implements)` | edges 1, 2 and 4 |
| `edges_of(owns)` | edge 3 |
| `edges_of(covers)` | none |
| `edges_from(item:src/lib.rs::f)` | edges 1, 2 and 4 |
| `edges_to(requirement:a/one)` | edges 1 and 4 |
| `edges_to(capability:a)` | none |
| `dangling` | edges 2 and 3 |

### Requirement: Tag ids
`tag_id(name)` SHALL turn a requirement or scenario name into the kebab-case
id that `Implements:` and `Covers:` tags name: ASCII letters are lowercased,
ASCII digits are kept, every run of any other characters becomes one `-`,
and a leading or trailing `-` is dropped.

#### Scenario: Tag id cases
- **WHEN** `tag_id` reads each name below
- **THEN** it returns the given id:

| Name | Id |
|---|---|
| `Code ownership` | `code-ownership` |
| `ADR records` | `adr-records` |
| `Core does no IO` | `core-does-no-io` |
| `Event lines round-trip` | `event-lines-round-trip` |
| `Rust CI parity job` | `rust-ci-parity-job` |
| `  Spaced -- out!  ` | `spaced-out` |
| `Café menu 2` | `caf-menu-2` |
| `already-kebab` | `already-kebab` |
| empty | empty |

### Requirement: Link rules
A link rule SHALL implement core's `Rule` trait: `name` gives the rule's
name, and `check` reads a `Graph` and returns its findings. A `Finding`
holds the `rule` name, the `node` it is about, an optional `location`,
a `message` and a `fix`, and displays as `<location>: <message>`, or as
`<node>: <message>` without a location. `run_rules(graph, rules)` SHALL
return every rule's findings, rule by rule in the order given, each
rule's findings in the order it returned them.

#### Scenario: Rules run in order
- **WHEN** `run_rules` runs, over the graph of "Graph queries", a rule named `dangling` that returns one finding per dangling edge, about its `from` node, at its location, with the message `<kind> edge to <to> names no node` and the fix `Name a node that exists.`, and then a rule named `quiet` that returns none
- **THEN** it returns these findings, in order:

| Rule | Node | Display |
|---|---|---|
| `dangling` | `item:src/lib.rs::f` | `src/lib.rs:4: implements edge to requirement:a/two names no node` |
| `dangling` | `capability:a` | `capability:a: owns edge to file:src/lib.rs names no node` |

#### Scenario: Finding display
- **WHEN** a finding with the message `m` is displayed with each location below
- **THEN** it reads as given:

| Node | Location | Display |
|---|---|---|
| `adr:001` | `decisions/001-a.md`, no line | `decisions/001-a.md: m` |
| `adr:001` | `src/lib.rs`, line 7 | `src/lib.rs:7: m` |
| `adr:001` | none | `adr:001: m` |

### Requirement: Lock units
`osq-core` SHALL map each file path of an approved task scope to the lock
unit it holds, in its `schedule` module, with no IO. `lock_unit(path)` SHALL
return `crates/core` for a path that starts with `crates/core/`,
`crates/kernel/<name>` for a path that starts with `crates/kernel/<name>/`,
and the path itself for any other path. Paths are compared as given. Two
changes overlap when the lock units of their files share at least one unit.

#### Scenario: Lock unit of a path
- **WHEN** `lock_unit` reads the path in the row
- **THEN** it returns the row's unit:

| Path | Unit |
|---|---|
| `src/a.ts` | `src/a.ts` |
| `crates/core/src/lib.rs` | `crates/core` |
| `crates/core/Cargo.toml` | `crates/core` |
| `crates/kernel/specs/src/lib.rs` | `crates/kernel/specs` |
| `crates/kernel/specs/tests/parse.rs` | `crates/kernel/specs` |
| `crates/kernel/README.md` | `crates/kernel/README.md` |
| `crates/features/run/src/lib.rs` | `crates/features/run/src/lib.rs` |
| `crates/corex/a.rs` | `crates/corex/a.rs` |

### Requirement: Change scheduling
`schedule(queue, running)` in `osq-core`'s `schedule` module SHALL decide,
with no IO, which approved changes may start now, as ADR 027 says. Each
`QueuedChange` holds its `id`, whether it is `approved`, its `dependencies`,
each a `Dependency` with an `id` and whether it is `done`, and the `files` of
its approved task scopes. Each `RunningChange` holds its `id` and `files`.
The result SHALL be a `Schedule` holding `states`, one `ScheduledChange` with
the change's `id` and `ScheduleState` per queued change in queue order, and
`start`, the ids of the `Ready` changes in queue order. A queued change whose
id names a running change SHALL be left out of both, and each state SHALL
follow "Schedule states".

#### Scenario: Scheduling is deterministic
- **WHEN** `schedule` runs twice on any queue and running set
- **THEN** both results are equal

#### Scenario: Started and running changes never overlap
- **WHEN** `schedule` runs on any queue and running set
- **THEN** no two of the started and running changes share a lock unit, except running changes with each other

#### Scenario: An unmet dependency never starts
- **WHEN** `schedule` runs on any queue and running set
- **THEN** no started change is unapproved or has a dependency that is not done

### Requirement: Schedule states
A queued change's state in `schedule`'s result SHALL be the first of these
that holds:

1. `NeedsApproval` when it is not approved.
2. `WaitingOn` the first of its dependencies, in their order, that is not done.
3. `BlockedBy` the first running change, in running order, that it overlaps.
4. `BlockedBy` the first change before it in the queue that this call made `Ready` and that it overlaps.
5. `Ready`.

A `BlockedBy` state SHALL hold the other change's id and the lock units the
two share, in byte order. A state SHALL display as its reason: `ready`,
`needs approval`, `waiting on <id>`, or `blocked by <id>: ` followed by the
shared units joined by `, `.

#### Scenario: Every state and overlap rule
- **WHEN** `schedule` runs with the running change `300` holding `src/a.ts` and the queue below, in this order
- **THEN** each change has the row's state, displayed as given, and `start` is `204`, `206`:

| Id | Approved | Dependencies | Files | State |
|---|---|---|---|---|
| `201` | no | none | `src/x.ts` | `needs approval` |
| `202` | yes | `150` done, `151` not done, `152` not done | `src/y.ts` | `waiting on 151` |
| `203` | yes | `150` done | `src/a.ts`, `src/b.ts` | `blocked by 300: src/a.ts` |
| `204` | yes | none | `crates/kernel/specs/src/lib.rs` | `ready` |
| `205` | yes | none | `crates/kernel/specs/tests/parse.rs` | `blocked by 204: crates/kernel/specs` |
| `206` | yes | none | `crates/core/src/lib.rs`, `src/b.ts` | `ready` |
| `207` | yes | none | `crates/core/Cargo.toml`, `src/b.ts` | `blocked by 206: crates/core, src/b.ts` |
| `300` | yes | none | `src/z.ts` | left out |

#### Scenario: Running changes come first
- **WHEN** `schedule` runs with the running changes `300` holding `src/a.ts` and `301` holding `src/b.ts`, and one queued approved change `210` holding `src/b.ts` and `src/a.ts`
- **THEN** `210` is `blocked by 300: src/a.ts` and `start` is empty

### Requirement: Feature trait
`osq-core` SHALL hold, in its `feature` module and with no IO, the object
safe `Feature` trait of ADR 028, which each feature crate implements once.
`name` gives the feature's name; `commands` lists `Command` values, each with
a `name`, `summary` and `usage`; `run` takes an `Invocation` of the project
`root`, the `command` and its string `args`, and returns an `Output` with the
`text` to print or a `FeatureError`. As ADR 030 says, `reacts_to` lists the
`EventKind` values the feature reacts to, an empty list by default, and
`react` takes a `&Reaction<'_>` and returns an `Output` or a
`FeatureError`, by default `Output::text("")`.

#### Scenario: A hand-written feature runs its commands
- **WHEN** a test implements `Feature` as `echo`, offering `say` with usage `<words>...` and `fail` with an empty usage, and runs the invocation in the row
- **THEN** `run` returns the row's result:

| Command | Args | Result |
|---|---|---|
| `say` | `a`, `b` | output `a b` |
| `say` | none | `Usage` error displayed `usage of say: needs words` |
| `fail` | none | `Failed` error displayed `fail failed: it always fails` |
| `nope` | none | `UnknownCommand` error displayed `unknown command: nope` |

#### Scenario: Features register as a list
- **WHEN** the `echo` feature and a second test feature `count`, offering `count`, are held in that order as a `Vec<Box<dyn Feature>>`
- **THEN** their names read `echo`, `count`, the command names read `say`, `fail`, `count`, and the invocation `count` with args `x`, `y` sent to the first feature that lists `count` returns output `2`

#### Scenario: Reaction defaults
- **WHEN** a test feature implements only `name`, `commands` and `run`, and its `reacts_to` and its `react` with a `Reaction` of a `rejected` envelope are called
- **THEN** `reacts_to` is empty and `react` returns `Output::text("")`

### Requirement: Feature constructors
`Command`, `Invocation`, `Output`, `FeatureError` and each `FeatureError`
variant SHALL be `#[non_exhaustive]`, so a field or variant added later
touches no feature crate. Code outside `osq-core` SHALL build them through
`Command::new(name, summary, usage)`, `Invocation::new(root, command, args)`,
`Output::text(text)`, `Output::with_code(text, code)`,
`FeatureError::unknown_command(name)`,
`FeatureError::usage(command, message)` and
`FeatureError::failed(command, message)`, and SHALL read their public fields.
`Output` holds the `text` to print and the `code: i32` the process exits
with: `Output::text` gives the code 0, and `Output::with_code` the code it
is given, for a command that prints its text on stdout and still fails,
as a JSON document of findings does.

#### Scenario: Constructors fill every field
- **WHEN** the constructor call in the row runs in a test outside `osq-core`
- **THEN** the value's public fields hold the row's values:

| Call | Fields |
|---|---|
| `Command::new("say", "Says words", "<words>...")` | `name` `say`, `summary` `Says words`, `usage` `<words>...` |
| `Invocation::new("/p", "say", ["a", "b"])` | `root` `/p`, `command` `say`, `args` `a`, `b` |
| `Output::text("a b")` | `text` `a b` |
| `FeatureError::unknown_command("nope")` | `UnknownCommand` with name `nope` |
| `FeatureError::usage("say", "needs words")` | `Usage` with `command` `say`, `message` `needs words` |
| `FeatureError::failed("fail", "it always fails")` | `Failed` with `command` `fail`, `message` `it always fails` |

#### Scenario: Output exit codes
- **WHEN** the `Output` constructor call in the row runs in a test outside `osq-core`
- **THEN** the output's `text` and `code` hold the row's values:

| Call | `text` | `code` |
|---|---|---|
| `Output::text("a b")` | `a b` | 0 |
| `Output::with_code("bad", 1)` | `bad` | 1 |
| `Output::with_code("odd", 3)` | `odd` | 3 |

### Requirement: Feature errors
A `FeatureError` SHALL be `UnknownCommand` with the command name, `Usage` with
the command and a message for arguments the feature cannot read, or `Failed`
with the command and a message for a command that failed after reading its
arguments. It SHALL implement `std::error::Error` and display as
`unknown command: <name>`, `usage of <command>: <message>` or
`<command> failed: <message>`.

#### Scenario: Feature error text
- **WHEN** the error in the row is displayed
- **THEN** it reads the row's text:

| Error | Text |
|---|---|
| `FeatureError::unknown_command("nope")` | `unknown command: nope` |
| `FeatureError::usage("say", "needs words")` | `usage of say: needs words` |
| `FeatureError::failed("fail", "it always fails")` | `fail failed: it always fails` |

### Requirement: Scope coverage
`scope_covers_path(scope: &[String], path: &str) -> bool` in `osq-core`
SHALL tell whether scope entries cover one project-relative path, as
TypeScript's `scopeCoversPath` does and rust-specs "Scope globs" spells out:
entry and path normalized (JavaScript-trimmed, `\` to `/`, leading `./`
runs removed), then an exact match or a whole-path match of a pattern entry,
one holding `*` or `?` or ending with `/`. It is the one glob matcher; the
specs kernel's `scope_covers_path` calls it.

#### Scenario: Scope coverage cases
- **WHEN** `osq_core::scope_covers_path` checks each scope and path below
- **THEN** it returns the given result:

| Scope | Path | Covered |
|---|---|---|
| `src/alpha/**` | `src/alpha/a.ts` | true |
| `src/alpha/**` | `src/alpha` | false |
| `src/*.ts` | `src/x/a.ts` | false |
| `src/**/*.ts` | `src/a.ts` | true |
| `src/**.ts` | `src/x/a.ts` | true |
| `src/?.ts` | `src//.ts` | false |
| `src/alpha/` | `src/alpha/deep/a.ts` | true |
| `src\a.ts` | `src/a.ts` | true |
| `␠␠src/a.ts␠␠` | `src/a.ts` | true |
| `src/{a,b}.ts` | `src/a.ts` | false |
| none | `src/a.ts` | false |

`␠` stands for one space.

### Requirement: Scope audit
`audit_scope(audit: &ScopeAudit) -> Vec<Disallowed>` in `osq-core` SHALL
give every changed path a task may not have changed, as TypeScript's
guards do. `ScopeAudit` holds `scope`,
`tests_modify`, `change_folder`, `test_folders`, `lock_rules` and
`changes`, each a `ChangedPath { path, change }` with `change` `Added`,
`Modified` or `Deleted`. Each `Disallowed { path, reason }` has
`OutsideScope`, `FrozenTestModified` or `FrozenTestDeleted`, sorted by
path, `OutsideScope` first.

#### Scenario: Scope audit cases
- **WHEN** `audit_scope` runs with the scope `crates/alpha/**` and `src/a.ts`, the change folder `openspec/changes/001-a`, the test folders `crates/alpha/tests` and `crates/beta/tests`, the lock rules of Rust (manifest `Cargo.toml`, lock file `Cargo.lock`) and TypeScript (manifest `package.json`, lock files `package-lock.json`, `pnpm-lock.yaml` and `yarn.lock`), and the row's changes and `tests_modify`
- **THEN** it returns exactly the row's disallowed paths:

| Changes | `tests_modify` | Disallowed |
|---|---|---|
| `src/a.ts` modified | false | none |
| `src/b.ts` modified | false | `src/b.ts` outside scope |
| `crates/alpha/src/lib.rs` deleted | false | none |
| `crates/alpha/Cargo.toml` modified, `Cargo.lock` modified | false | none |
| `Cargo.lock` modified | false | `Cargo.lock` outside scope |
| `crates/beta/Cargo.toml` modified, `Cargo.lock` modified | false | `Cargo.lock` outside scope, `crates/beta/Cargo.toml` outside scope |
| `crates/alpha/Cargo.toml` modified, `crates/gamma/Cargo.lock` modified | false | `crates/gamma/Cargo.lock` outside scope |
| `crates/alpha/Cargo.toml` modified, `pnpm-lock.yaml` modified | false | `pnpm-lock.yaml` outside scope |
| `crates/alpha/tests/a.rs` modified | false | `crates/alpha/tests/a.rs` frozen test modified |
| `crates/alpha/tests/a.rs` modified | true | none |
| `crates/alpha/tests/a.rs` deleted | false | `crates/alpha/tests/a.rs` frozen test deleted |
| `crates/alpha/tests/new.rs` added | false | none |
| `crates/beta/tests/a.rs` modified | true | `crates/beta/tests/a.rs` outside scope, `crates/beta/tests/a.rs` frozen test modified |
| `crates/beta/tests/new.rs` added | false | `crates/beta/tests/new.rs` outside scope |
| `tests/new.test.ts` added | false | none |
| `tests/old.test.ts` modified | true | `tests/old.test.ts` outside scope, `tests/old.test.ts` frozen test modified |
| `openspec/changes/001-a/.run/results/1.md` added | false | none |
| `openspec/changes/001-a/tasks.md` modified | false | none |
| `openspec/changes/001-ab/notes.md` added | false | `openspec/changes/001-ab/notes.md` outside scope |

### Requirement: Scope audit rules
A changed path SHALL be `OutsideScope` unless it is added under the root
`tests` folder, the scope covers it, it is in the change folder, or it is a
lock file following a covered changed manifest: a `LockRule { manifests,
lock_files }` names both base names and the manifest's folder is at or
below the lock file's. A modified or deleted path at or under `tests` or a
test folder is frozen unless `tests_modify` is set and the scope covers
it.

#### Scenario: Lock file at the root follows any covered manifest
- **WHEN** `audit_scope` runs with the scope `crates/alpha/deep/**`, the Rust lock rule and the changes `crates/alpha/deep/Cargo.toml` and `Cargo.lock`, both modified
- **THEN** it returns no disallowed path

### Requirement: Event kinds
`osq-core` SHALL export `EventKind`, a `#[non_exhaustive]` enum deriving
`Clone`, `Copy`, `Debug`, `PartialEq`, `Eq` and `Hash`, with one unit
variant per `Event` variant, of the same name. `Event::kind(&self) ->
EventKind` SHALL give the variant's kind, and `EventKind::name(self) ->
&'static str` the `type` string that variant's event lines carry.

#### Scenario: Kinds of events
- **WHEN** a test reads `kind()` of the event in the row and `name()` of that kind
- **THEN** they are the row's:

| Event | Kind | Name |
|---|---|---|
| a `rejected` event | `EventKind::Rejected` | `rejected` |
| a `dead` event | `EventKind::Dead` | `dead` |
| a `recertification` event | `EventKind::Recertification` | `recertification` |
| a `verify_ran` event | `EventKind::VerifyRan` | `verify_ran` |

#### Scenario: Every kind names its type
- **WHEN** a test parses one valid line of each event type osq writes with `parse_event_line`, as the event round-trip tests build them
- **THEN** each event's `kind().name()` equals the line's `type`, and the kinds are all different

### Requirement: Reaction
`osq-core` SHALL export `Reaction<'a>`, a `#[non_exhaustive]` struct
deriving `Clone`, `Copy` and `Debug`, holding `root: &'a Path`, the project
root, `change: &'a Path`, the change folder, and `envelope: &'a Envelope`,
the event to react to. Code outside `osq-core` SHALL build it with
`Reaction::new(root, change, envelope)`.

#### Scenario: Reaction fields
- **WHEN** a test outside `osq-core` calls `Reaction::new` with the root `/p`, the change `/p/openspec/changes/001-a` and a `rejected` envelope
- **THEN** its `root`, `change` and `envelope` fields are those values
