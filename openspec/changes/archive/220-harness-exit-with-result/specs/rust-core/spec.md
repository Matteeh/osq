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
