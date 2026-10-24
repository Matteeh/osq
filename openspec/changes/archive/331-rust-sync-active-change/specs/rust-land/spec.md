## MODIFIED Requirements

### Requirement: Sync command
`sync <id>` SHALL take the default branch into a change's branch without
landing it, as TypeScript's `syncChange` does for a change in an osq
worktree, failing with the first message in this order and writing nothing
before step 8:

1. It SHALL read the root's settings as "Land settings" says, and fail
   with `osq sync needs vcs.enabled and git` when `vcs.enabled` is false
   or `GitVcs` at the root gives no repository `root`.
2. The worktree changes are those "Land lookup" defines. The change SHALL
   be the first worktree change matching the query, as "Land lookup"
   matches, whose worktree holds `openspec/changes/archive/<folder>`; its
   change folder is that archived folder. With none, it SHALL be the first
   matching worktree change whose worktree holds an entry
   `openspec/changes/<folder>/.run/approved`, of any kind, as TypeScript's
   `holdsChange` finds one; its change folder is the active folder
   `openspec/changes/<folder>`. With neither, `sync` SHALL fail with `No
   change "<query>" runs in an osq worktree`, with the query as given.
3. It SHALL read rust-storage `read_watch_state` of the root and the
   folder the `HOME` environment variable names, or the empty path when it
   is unset. When it gives a service record, or else a watcher record, it
   SHALL fail with `a watcher runs for this project (pid <pid>); it syncs
   <folder> before the change's next attempt, or stop it and run osq sync
   <query> again`, with that record's pid and the query as given.
4. When rust-storage `read_now_facts` of the change folder in the worktree
   gives a task that is `running` and neither `regressed`, `done` nor
   `dead`, it SHALL fail with `<folder> has a task running; run osq sync
   <query> after it ends`, with the query as given.
5. When rust-storage `read_land_facts` of the change folder in the
   worktree gives a `stacked_on` that is not empty, it SHALL fail with
   `<folder> is stacked on <names joined by ", ">; Rust sync does not sync
   stacked changes yet`.
6. It SHALL read `status` with a `GitVcs` at the worktree's path built as
   "Land git limits" says. Each entry's `path`, and its `from` when it has
   one, counts unless it is `<change>/tasks.md` or starts with
   `<change>/.run/`, where `<change>` is the change folder's path relative
   to the worktree. When any path counts, it SHALL fail with `<worktree>
   has uncommitted changes: <the counted paths, without repeats, in byte
   order, joined by ", ">; commit or discard them first`, where
   `<worktree>` is the worktree's path as `worktree_list` gives it.
7. The default branch SHALL be the one "Land settings" names.
8. For an archived change it SHALL run "Land sync", with "Land sync
   verify" in its step 5, on the worktree exactly as `land` runs it, except
   that no stop SHALL write the record "Land stop record" names: a stop
   undoes its own writes as "Land sync" says and fails `sync` with the
   stop's message. For an active change it SHALL run "Active sync". When
   the sync writes nothing because the default branch is an ancestor of the
   worktree's HEAD, the output SHALL be `osq/<folder> already has <default
   branch>` and a newline; when it commits, the output SHALL be `Synced
   osq/<folder> with <default branch>` and a newline.

`sync` SHALL never write the checkout, the default branch, or another
worktree, and SHALL not run "Land commit". TypeScript's progress line on
stderr is not part of the output.

A test of a row whose name holds `watcher` runs `sync` in a child test
process whose `HOME` is a scratch folder, as `spawn_home_child` in
`crates/features/show/tests/status_command.rs` runs one, with
`watcher.json` in rust-storage `watch_state_dir` of the checkout and that
folder holding the record the script writes with the child's own pid, and
`<pid>` in the row stands for that pid.

#### Scenario: Sync equals TypeScript's
- **WHEN** a test runs `sync` with each row's `query` of `tests/fixtures/sync-message-golden/sync.json` whose name does not start with `active-`, on a land repository built for the row as `tests/fixtures/sync-message-golden/print-sync-message-goldens.mjs.txt` builds it, with each commit message the script gives
- **THEN** a row with `exit` 0 gives output text equal to its `stdout`, and a row with `exit` 1 gives a `Failed` error for the command `sync` whose message is its `error`; and after the run the full message of `osq/001-alpha-orders`'s tip, as `git log -1 --format=%B` prints it, equals the row's `tip`, the worktree's `git status --porcelain --untracked-files=all` equals its `status`, the archived folder holds `.run/regressed/change.md` exactly when `regressed` is true, and the worktree's `openspec/specs/orders/spec.md` equals the row's `spec` when the row has one; `<wt>` stands for the worktree's path:

| Row | Query | Result |
|---|---|---|
| `clean-001` | `1` | `Synced osq/001-alpha-orders with main\n` |
| `current-001` | `1` | `osq/001-alpha-orders already has main\n` |
| `spec-conflict-001` | `1` | `Synced osq/001-alpha-orders with main\n`, with the merged `orders` spec |
| `code-conflict-001` | `1` | `001-alpha-orders: src/one.txt conflict with main; run osq plan 001, and approving the revised plan restarts osq/001-alpha-orders from main`, with no record |
| `vcs-off-001` | `1` | `osq sync needs vcs.enabled and git` |
| `dirty-001` | `1` | `<wt> has uncommitted changes: notes.txt; commit or discard them first` |
| `run-dirt-001` | `001` | `Synced osq/001-alpha-orders with main\n` |
| `renamed-001` | `1` | `<wt> has uncommitted changes: moved.txt, notes.txt; commit or discard them first` |
| `tasks-dirt-001` | `1` | `Synced osq/001-alpha-orders with main\n` |
| `missing-2` | `2` | `No change "2" runs in an osq worktree` |
| `watcher-archived-001` | `1` | `a watcher runs for this project (pid <pid>); it syncs 001-alpha-orders before the change's next attempt, or stop it and run osq sync 1 again` |

#### Scenario: Sync refusals Rust adds
- **WHEN** `sync` runs with the query `1` on a land repository holding the row's change after `main` gained a commit that writes `other.txt` holding `other\n`
- **THEN** it gives a `Failed` error for the command `sync` with the row's message, and the change's branch tip and worktree status are what they were before `sync` ran:

| Change | Message |
|---|---|
| the fixture change, whose archived folder also holds `.run/stacked-on` holding `000-base sha256:x\n000-more sha256:y\n`, committed | `001-alpha-orders is stacked on 000-base, 000-more; Rust sync does not sync stacked changes yet` |
| `001-alpha-orders`, whose worktree holds it under `openspec/changes/001-alpha-orders` with `proposal.md`, `.run/approved` and `.run/stacked-on` holding `000-base sha256:x\n`, committed, and not under the archive | `001-alpha-orders is stacked on 000-base; Rust sync does not sync stacked changes yet` |

## ADDED Requirements

### Requirement: Active sync
For an active change, `sync` SHALL take the default branch into
`osq/<folder>` as TypeScript's `syncWithDefaultBranch` does for an active
change. It SHALL run the steps of "Land sync" with the active folder
`openspec/changes/<folder>` in the worktree in place of the archived
folder, so the requirements base, the deltas and `.run/events/change.jsonl`
are the active folder's, with these differences:

- Between step 1 and step 2 it SHALL pick the tasks "Active sync verify"
  runs: each task rust-storage `read_now_facts` of the active folder gives
  that is `done` and neither `regressed` nor `manual`, in numeric order of
  its id, whose `tasks/<id>.md` rust-specs `read_task_file` reads with a
  `verify` that is not empty. A task whose file does not read is passed
  over. When rust-storage `read_done_scope` of the active folder gives a
  `DoneScope` for a picked task and rust-storage `task_scope_hash` of the
  worktree with the task file's `scope`, taken then, equals its
  `scope_hash`, the task is also kept for "Active sync recertification"
  with that `DoneScope`.
- Step 3 SHALL write the default branch's copies and stage them as it
  says, with the capabilities the active folder has a delta for, and SHALL
  not apply the active folder's deltas: no `merge_change` runs, and the
  living specs keep the default branch's text.
- Step 5 SHALL run "Active sync verify" and then "Active sync
  recertification" in place of "Land sync verify", before the `synced`
  event.
- Every stop, after "Land sync" undoes its own writes, SHALL also write
  back each file "Active sync recertification" wrote as it was before,
  removing one that was absent.

Every failure of the active sync, a stop or any other error, from step 1
on, SHALL then append to the active folder's `.run/events/change.jsonl` a
`sync_stopped` event, through rust-core's `Envelope` and `event_line`,
with the current time in ISO 8601 UTC to the millisecond and the data
`reason`, the stop's reason or `sync_failed` for any other error,
`message`, the failure's message, and `defaultBranch`, creating its
folder. That event SHALL not be staged or committed, and `sync` SHALL fail
with the failure's message. A refusal of "Sync command" appends nothing.

#### Scenario: Active sync equals TypeScript's
- **WHEN** a test runs `sync` with each row's `query` of `tests/fixtures/sync-message-golden/sync.json` whose name starts with `active-`, on a land repository built for the row as `tests/fixtures/sync-message-golden/print-sync-message-goldens.mjs.txt` builds it, with task 1's done marker written with rust-storage `task_scope_hash` as the script writes it with `computeTaskScopeHash`
- **THEN** the output, error, `tip`, `status`, `regressed` and `spec` equal the row's as "Sync equals TypeScript's" compares them; when the row has `changeEvents` and `taskEvents`, the lines the run added to the active folder's `.run/events/change.jsonl` and `.run/events/1.jsonl`, each parsed as JSON with its `timestamp` replaced by `<ts>` and a numeric `data.duration` by `<ms>`, equal them; and the active folder's `.run/done/1`, with a `recertified_at` line's value replaced by `<ts>`, equals the row's `done`; `<wt>` stands for the worktree's path:

| Row | Query | Result |
|---|---|---|
| `active-recert-001` | `1` | `Synced osq/001-alpha-orders with main\n`, task 1 recertified |
| `active-clean-001` | `001` | `Synced osq/001-alpha-orders with main\n`, task 1's marker kept |
| `active-current-001` | `1` | `osq/001-alpha-orders already has main\n` |
| `active-red-001` | `1` | `001-alpha-orders: verify of task 3 failed on osq/001-alpha-orders merged with main:\nbroken` |
| `active-code-conflict-001` | `1` | `001-alpha-orders: src/one.txt conflict with main; run osq plan 001, and approving the revised plan restarts osq/001-alpha-orders from main` |
| `active-spec-001` | `1` | `Synced osq/001-alpha-orders with main\n`, with `main`'s `orders` spec |
| `active-prepare-001` | `1` | `prepare failed in worktree <wt> on branch osq/001-alpha-orders:\nnope\n` |
| `active-running-001` | `1` | `001-alpha-orders has a task running; run osq sync 1 after it ends` |
| `active-dirty-001` | `1` | `<wt> has uncommitted changes: notes.txt; commit or discard them first` |
| `active-unapproved-001` | `1` | `No change "1" runs in an osq worktree` |
| `active-watcher-001` | `1` | `a watcher runs for this project (pid <pid>); it syncs 001-alpha-orders before the change's next attempt, or stop it and run osq sync 1 again` |

### Requirement: Active sync verify
In step 5 of "Active sync", before "Active sync recertification", `sync`
SHALL run the verify of each task "Active sync" picked, in its order, as
TypeScript's `runSyncVerify` does for an active change. Each runs in the
worktree through rust-harnesses `run_verify` as "Land sync verify" runs
its commands, bounded by `timeouts.verifyTimeoutSeconds`, with the change
set to the active folder's absolute path and no diff, and runs once more
at once when it does not exit 0. No proposal `verify` or `check` runs for
an active change.

Each run SHALL be logged and recorded as "Land sync verify" says, in the
active folder's `.run/logs/` and `.run/events/change.jsonl`, with the
`verify_ran` data also holding `task`, the task's id, last. When both runs
of a task's verify do not exit 0, the sync SHALL stop with the reason
`sync_verify_red` and the message `<folder>: verify of task <id> failed on
osq/<folder> merged with <default branch>:`, a newline, and the second
run's output tail "Land sync" names.

#### Scenario: Active sync verifies done tasks
- **WHEN** `sync` runs the golden row `active-clean-001` as "Active sync equals TypeScript's" runs it
- **THEN** the active folder's `.run/events/change.jsonl` on the branch's tip ends with a `verify_ran` event whose data is `command` `echo one`, `exitCode` 0, a `duration`, `log` `.run/logs/change-1.log`, `output` `one\n` and `task` `1`, then one whose data is `command` `echo three`, `exitCode` 0, a `duration`, `log` `.run/logs/change-2.log`, `output` `three\n` and `task` `3`, then a `synced` event whose `defaultBranch` is `main` and whose `commits` is 1; no event names task 2 or task 4

### Requirement: Active sync recertification
After every verify "Active sync verify" runs exits 0, `sync` SHALL
recertify each task "Active sync" kept, in its order, as TypeScript's
`recertifySyncTasks` does. It SHALL take rust-storage `task_scope_hash` of
the worktree with the task file's `scope`; when that `hash` equals the
kept `scope_hash`, it SHALL write nothing for the task. Otherwise it SHALL
keep the bytes of the active folder's `.run/done/<id>` and
`.run/events/<id>.jsonl`, or note that one is absent, the first time it
writes each, then:

1. rewrite `.run/done/<id>` with rust-storage `refresh_done_marker`,
   passing the kept `scope_hash`, the current scope hash and the current
   time in ISO 8601 UTC to the millisecond;
2. append to `.run/events/<id>.jsonl`, creating its folder, a
   `recertification` event through rust-core's `Envelope` and `event_line`
   with the current time and the data `task` `<id>`, `outcome` `passed`,
   `differingPaths`, rust-storage `differing_scope_paths` of the kept
   `scope_files` and the current scope hash, `attribution`, one
   `{"path":<that path>,"attribution":"sync"}` per differing path in the
   same order, `command`, the task's verify, `exitCode` 0, `timedOut`
   false, `recordedHash`, the kept `scope_hash`, `currentHash`, the current
   `hash`, and `automatic` true;
3. stage both files.

A `DoneMarkerError` SHALL stop the sync with the reason `sync_failed` and
its display. The sync commit of "Land sync" step 6 then holds both files.

#### Scenario: Sync recertifies a done task
- **WHEN** `sync` runs the golden row `active-recert-001` as "Active sync equals TypeScript's" runs it, where `main`'s commit adds `src/three.txt` holding `three\n` inside task 1's scope `src/**`
- **THEN** the branch's tip is the sync commit, the worktree's status is empty, and on that tip the active folder's `.run/done/1` holds `scope_hash: sha256:abd06aad734c595d9ca453314c581dd6103e868facbf06b6a39300d0cb11999a`, `  src/three.txt: sha256:f6936912184481f5edd4c304ce27c5a1a827804fc7f329f43d273b8621870776`, `original_scope_hash: sha256:bcf9ceadb6fd71887cd9924852f82d36b559475e12a0bfcc6992681ed4fbe75d` and `recertification_count: 1`, and `.run/events/1.jsonl` ends with one `recertification` event whose data is `{"task":"1","outcome":"passed","differingPaths":["src/three.txt (added)"],"attribution":[{"path":"src/three.txt (added)","attribution":"sync"}],"command":"echo one","exitCode":0,"timedOut":false,"recordedHash":"sha256:bcf9ceadb6fd71887cd9924852f82d36b559475e12a0bfcc6992681ed4fbe75d","currentHash":"sha256:abd06aad734c595d9ca453314c581dd6103e868facbf06b6a39300d0cb11999a","automatic":true}`
