## MODIFIED Requirements

### Requirement: Sync on request
`syncChange(projectRoot, config, id, progress, home)` in
`src/core/vcs/sync-change.ts` SHALL find the change the id matches, as
`matchesFolder` does, among the active and archived changes of the osq
worktree trees `listChanges` reports. `home` is optional and defaults to the
user's home folder, as `readWatchState` takes it. It SHALL refuse, writing
nothing, in this order:

- With `vcs.enabled` off or `NoVcs` selected: `osq sync needs vcs.enabled and
  git`.
- When no such change exists: `No change "<id>" runs in an osq worktree`.
- When `readWatchState(projectRoot, home)` reports a live service or watcher
  record: `a watcher runs for this project (pid <pid>); it syncs <folder>
  before the change's next attempt, or stop it and run osq sync <id> again`,
  where `<pid>` is the service's pid when a service record is live and the
  watcher's pid otherwise, as the status watcher line names it.
- When `deriveSpecState` reports a task of the change as running: `<folder>
  has a task running; run osq sync <id> after it ends`.
- When `awaitedDependencies` lists any entry for the change: `<folder> is
  stacked on <folders, comma-separated>, which has not landed; land it first`.
- When the worktree's `status` lists a path outside the change folder's
  `.run/` other than its `tasks.md`: `<worktree> has uncommitted changes:
  <paths>; commit or discard them first`.

It SHALL then run `syncWithDefaultBranch` for the change, passing on its
progress callback, and return `Synced osq/<folder> with <default branch>` when
the sync merged and `osq/<folder> already has <default branch>` when it did
not. When the sync stops for an active change, `syncChange` SHALL append to
the change folder's `.run/events/change.jsonl` a `sync_stopped` event whose
data holds `reason`, the stop's `reason` or `sync_failed` for any other error,
`message`, and `defaultBranch`. It SHALL leave that file uncommitted and then
throw the stop's message. For an archived change it SHALL append nothing,
because `osq land` refuses a worktree with any uncommitted file. `syncChange`
SHALL write no marker under `.run/`; halting belongs to the watcher.

#### Scenario: Sync an active change
- **WHEN** a change approved into a worktree has one verified task and the default branch has moved
- **THEN** `syncChange` returns `Synced osq/<folder> with main`, and the branch tip is `osq: <id> sync main`

#### Scenario: Nothing to take in
- **WHEN** the default branch has not moved since approval
- **THEN** `syncChange` returns `osq/<folder> already has main` and the branch tip is unchanged

#### Scenario: Task running
- **WHEN** a task of the change holds a live lock in `.run/running/`
- **THEN** `syncChange` refuses with `<folder> has a task running; run osq sync <id> after it ends`, and the branch tip is unchanged

#### Scenario: Stacked on an unlanded change
- **WHEN** the change was cut from `001`'s archive commit and `001` has not landed
- **THEN** `syncChange` refuses with `<folder> is stacked on 001-<words>, which has not landed; land it first`

#### Scenario: Stop is recorded, not halted
- **WHEN** the sync of an active change stops on a code conflict in `src/app.txt`
- **THEN** `syncChange` throws the stop's message, the branch tip is unchanged, `.run/regressed/change.md` does not exist, and the change's `.run/events/change.jsonl` ends with an uncommitted `sync_stopped` event with reason `sync_conflict` whose message names `src/app.txt`

#### Scenario: Archived change stop leaves the worktree clean
- **WHEN** the sync of an archived change stops on a code conflict
- **THEN** `syncChange` throws the stop's message, and the worktree's `status` is empty

#### Scenario: Watcher running
- **WHEN** the default branch has moved, the change `001-order-flow` has one verified task, and `syncChange(project, config, '001', undefined, home)` runs with the row's records written for the project under a scratch `home`
- **THEN** the row's outcome holds:

| Records under `home` | Outcome |
|---|---|
| a watcher record whose pid is the test's own process | refuses with `a watcher runs for this project (pid <the test's pid>); it syncs 001-order-flow before the change's next attempt, or stop it and run osq sync 001 again`; the branch tip is unchanged and the worktree's `status` is empty |
| a service record whose pid is the test's own process, and a watcher record whose pid is the test's parent process | refuses with the same message naming the test's pid, not its parent's; the branch tip is unchanged and the worktree's `status` is empty |
| a watcher record whose pid is 999999999 | returns `Synced osq/001-order-flow with main` |
| none | returns `Synced osq/001-order-flow with main` |
