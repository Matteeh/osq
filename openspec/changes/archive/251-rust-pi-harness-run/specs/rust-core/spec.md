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
