## ADDED Requirements

### Requirement: Sync recertifies done tasks
When "Default branch sync" merges into an active change without `skipVerify`,
it SHALL recertify each done task whose files only the merge changed, through
`src/core/vcs/sync-recertify.ts`:

1. Before the merge, for each task step 5 will verify whose done marker
   `readDoneMarker` reads, it SHALL hash the task's scope with
   `computeTaskScopeHash`. A task whose hash then differs from the marker's
   `scope_hash` is left out.
2. After every verify of step 5 passed and before the `synced` event, for
   each task kept in step 1 whose scope hash on the merged tree differs from
   its marker's `scope_hash`, it SHALL refresh the done marker with
   `refreshRecertifiedDoneMarker` and append to `.run/events/<n>.jsonl` a
   `recertification` event with `outcome: passed`, `automatic: true`,
   `differingPaths`, an `attribution` of `sync` for each differing path, the
   task's verify `command`, `exitCode` 0, `timedOut` false, `recordedHash`,
   and `currentHash`.
3. It SHALL stage each refreshed done marker and task stream, so step 6's
   commit holds them.

Before it writes a done marker or task stream, it SHALL keep its contents, and
after any later stop it SHALL write them back, as it does for
`.run/events/change.jsonl`.

#### Scenario: Main changes a done task's file
- **WHEN** task 1 of active `002` is done with a recorded scope hash, the default branch changes `src/a.txt` in task 1's scope, and the sync's verify of task 1 passes
- **THEN** the sync commit `osq: 002 sync main` holds `.run/done/1` with the merged tree's scope hash and `recertification_count: 1`, and `.run/events/1.jsonl` ends with a `recertification` event with `automatic: true` and attribution `sync` for `src/a.txt`

#### Scenario: Change archives after the sync
- **WHEN** the watcher syncs that change before archive with every task done
- **THEN** the change archives with no `.run/regressed/` marker

#### Scenario: Task changed before the merge
- **WHEN** task 1's scope already differs from its done record before the merge
- **THEN** the sync leaves `.run/done/1` and `.run/events/1.jsonl` unchanged

#### Scenario: Merge leaves the task alone
- **WHEN** the default branch changes no file in task 1's scope
- **THEN** the sync leaves `.run/done/1` and `.run/events/1.jsonl` unchanged

#### Scenario: Commit fails after a recertification
- **WHEN** the sync recertified task 1 and its commit fails on a hook
- **THEN** `.run/done/1` and `.run/events/1.jsonl` hold what they held before the sync

### Requirement: Git output has no size limit
`runGit` in `src/core/vcs/git-vcs.ts` SHALL read git's whole output, however
large, so a diff or patch of any size reaches its caller.

#### Scenario: Large patch
- **WHEN** the worktree holds a 3 MB change and `patch()` runs
- **THEN** it returns the whole diff without an error
