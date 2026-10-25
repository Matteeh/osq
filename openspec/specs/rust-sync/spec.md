# rust-sync Specification

## Purpose
The sync kernel takes the default branch into a change's branch for every Rust caller: land and sync now, approve and the loop's run and archive gates later. It returns a typed outcome, with the conflicted paths when a merge stops, so each caller decides in its own command what a stop means.

## Requirements

### Requirement: Code ownership
<!-- source: crates/kernel/sync/** -->
The rust-sync capability SHALL own the `osq-kernel-sync` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Sync crate ownership
- **WHEN** file ownership is resolved for the sync kernel
- **THEN** system maps `crates/kernel/sync/**` to rust-sync

### Requirement: Sync change
`sync_change(request: &SyncRequest<'_>) -> Result<SyncOutcome, SyncStop>`
in `osq-kernel-sync` SHALL take the default branch into the branch checked
out in `request.worktree`, for the change folder `request.folder`.
`SyncRequest` holds `worktree: &Path`, `folder: &str`, `kind: SyncKind`,
`default_branch: &str`, `settings: &VcsConfig`, `timeouts: &Timeouts`,
`limits: &Limits` and `options: SyncOptions`. `SyncKind` is `Archived`,
for a folder under `openspec/changes/archive/`, or `Active`, for one
under `openspec/changes/`.

With `SyncKind::Archived` it SHALL run the steps rust-land "Land sync"
and "Land sync verify" give, and with `SyncKind::Active` the steps
rust-land "Active sync", "Active sync verify" and "Active sync
recertification" give, as `osq land` and `osq sync` ran them before
this kernel existed: the same git calls, files, events, commit and
messages, with the differences "Sync options" gives.

- When the default branch is an ancestor of the worktree's HEAD, it
  SHALL write nothing and return `Ok(SyncOutcome::AlreadySynced)`.
- When the sync commits, it SHALL return
  `Ok(SyncOutcome::Synced { commit })` with the sync commit's sha.
- Every stop and every other error SHALL undo the sync's own writes as
  those requirements say and return `Err(SyncStop { reason, message,
  conflicts })`. `reason` is the stop's `SyncStopReason`, or
  `sync_failed` for any other error, and `message` is the text the
  command fails with. For a `sync_conflict` stop, `conflicts` holds the
  paths the message names, in the merge's order; it is empty for every
  other stop.

The kernel SHALL depend only on `osq-core` and other kernel crates.

#### Scenario: Sync outcomes
- **WHEN** a test runs `sync_change` with `SyncKind::Archived` and `SyncOptions { records: false, verify: true, tasks: None }` on each row's sync repository: a `main` branch whose first commit holds `src/one.txt` with `one\n`, and the branch `osq/001-alpha-orders` checked out in a worktree, whose commit holds `src/one.txt` with `two\n` and the archived folder `openspec/changes/archive/001-alpha-orders` with a `proposal.md` whose frontmatter `verify` is `true`
- **THEN** the result is the row's, and the worktree's HEAD is the row's:

| `main` after the branch | Result | Worktree HEAD |
|---|---|---|
| no new commit | `Ok(SyncOutcome::AlreadySynced)` | the branch's commit |
| a commit adding `other.txt` with `other\n` | `Ok(SyncOutcome::Synced { commit })` | `commit`, a merge whose message is the sync message rust-land "Land sync" gives and whose tree holds `other.txt` |
| a commit writing `src/one.txt` with `main\n` | `Err(SyncStop { reason: SyncStopReason::SyncConflict, message: "001-alpha-orders: src/one.txt conflict with main; run osq plan 001, and approving the revised plan restarts osq/001-alpha-orders from main", conflicts: ["src/one.txt"] })` | the branch's commit, with no merge in progress |

### Requirement: Sync options
`SyncOptions` SHALL hold `records: bool`, `verify: bool` and
`tasks: Option<Vec<String>>`, chosen by the caller:

- `records`: when true, a stop rust-land "Land stop record" names SHALL
  be recorded on the change's branch as that requirement says, and a
  failure to record SHALL add its lines to `message` as it says. When
  false, no stop is recorded.
- `verify`: when false, the sync SHALL run neither rust-land "Land sync
  verify" for an archived change nor "Active sync verify" and "Active
  sync recertification" for an active one, and so writes no verify log,
  `verify_ran` event or recertification. Every other step runs.
- `tasks`: for an active change, `None` SHALL verify the tasks rust-land
  "Active sync" picks. `Some(ids)` SHALL keep only the picked tasks
  whose id is in `ids`, in the picked order. An archived change ignores
  it.

`osq land` SHALL call `sync_change` with `records: true`, `verify: true`
and `tasks: None`, and `osq sync` with `records: false`, `verify: true`
and `tasks: None`, so both behave as before.

#### Scenario: Options chosen by the caller
- **WHEN** a test runs `sync_change` on each row's sync repository of "Sync outcomes", after `main` gained the row's commit, with the row's kind and options
- **THEN** the result and the files are the row's:

| Kind and folder | `main` after the branch | Options | Result | Files |
|---|---|---|---|---|
| `Archived`, proposal `verify` is `false` | a commit adding `other.txt` | `records: false, verify: true, tasks: None` | `Err` with reason `SyncStopReason::SyncVerifyRed` | the worktree's HEAD is the branch's commit |
| `Archived`, proposal `verify` is `false` | a commit adding `other.txt` | `records: false, verify: false, tasks: None` | `Ok(SyncOutcome::Synced { commit })` | the archived folder has no `.run/logs` folder and its `.run/events/change.jsonl` has no `verify_ran` event |
| `Archived` | a commit writing `src/one.txt` with `main\n` | `records: true, verify: true, tasks: None` | `Err` with reason `SyncStopReason::SyncConflict` and `conflicts: ["src/one.txt"]` | the worktree's HEAD is a new commit with the message `osq: 001 land stopped` holding `.run/regressed/change.md` |
| `Active`, done tasks 1 with verify `false` and 2 with verify `true` | a commit adding `other.txt` | `records: false, verify: true, tasks: None` | `Err` with reason `SyncStopReason::SyncVerifyRed` | the worktree's HEAD is the branch's commit |
| `Active`, done tasks 1 with verify `false` and 2 with verify `true` | a commit adding `other.txt` | `records: false, verify: true, tasks: Some(["2"])` | `Ok(SyncOutcome::Synced { commit })` | task 1 has no new `verify_ran` event |

### Requirement: Sync stopped event
`append_sync_stopped(change: &Path, stop: &SyncStop, default_branch: &str)`
in `osq-kernel-sync` SHALL append to `<change>/.run/events/change.jsonl`
the `sync_stopped` event rust-land "Active sync" gives, with `reason` and
`message` from `stop` and `defaultBranch` from `default_branch`, creating
its folder, and SHALL neither stage nor commit it. `osq sync` SHALL call
it for every failed active sync.

#### Scenario: Stopped event appended
- **WHEN** a test calls `append_sync_stopped` with a scratch folder holding no `.run` folder, a `SyncStop` with reason `SyncStopReason::SyncConflict`, message `m` and conflicts `["a"]`, and the default branch `main`
- **THEN** `<folder>/.run/events/change.jsonl` holds one line, an event of type `sync_stopped` whose `data` is `{"reason":"sync_conflict","message":"m","defaultBranch":"main"}` and whose `timestamp` is UTC in the form `YYYY-MM-DDTHH:MM:SS.mmmZ`
