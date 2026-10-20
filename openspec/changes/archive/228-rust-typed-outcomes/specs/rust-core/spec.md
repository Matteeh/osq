## MODIFIED Requirements

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
