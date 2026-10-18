# Spec Delta: rust-core

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: crates/core/**, tests/rust-adrs.test.ts, tests/rust-ci.test.ts, scripts/verify-rust.sh, scripts/mutants-rust.sh, .cargo/mutants.toml, .github/workflows/rust.yml -->
The rust-core capability SHALL own the `osq-core` crate: its manifest, its
source and its tests, and the checks test of the Rust rebuild decisions. It
SHALL also own the Rust workspace's verify and mutation scripts, the
cargo-mutants settings, the Rust CI workflow and its test.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for the `Event` enum, the folds or the change typestate
- **THEN** system maps `crates/core/**` to rust-core

#### Scenario: Rust decisions test ownership
- **WHEN** file ownership is resolved for `tests/rust-adrs.test.ts`
- **THEN** system maps it to rust-core

#### Scenario: Rust tooling ownership
- **WHEN** file ownership is resolved for `scripts/verify-rust.sh`, `scripts/mutants-rust.sh`, `.cargo/mutants.toml`, `.github/workflows/rust.yml` and `tests/rust-ci.test.ts`
- **THEN** system maps each to rust-core

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
