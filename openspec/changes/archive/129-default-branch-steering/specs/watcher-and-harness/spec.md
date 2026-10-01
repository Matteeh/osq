## MODIFIED Requirements

### Requirement: Watcher sync
With `vcs.enabled` on and `GitVcs` selected, the watcher cycle SHALL run
`syncWithDefaultBranch` for a change running in a worktree, passing a progress
callback that logs each line, at two points and no others:

- Before it spawns a task, after the worktree check of "Worktree run" passes
  and before the scope audit, when no task of the change has a
  `.run/done/<n>` marker.
- Before it archives, after that worktree check passes and before
  `checkAndArchiveSpec`.

It SHALL skip both while `awaitedDependencies`, given the checkout's project
root, lists any entry for the change, because a stacked dependent's branch
holds its dependency's archive until the dependency lands. When the sync
stops, the watcher SHALL halt the change as "Worktree halt" says, with the
stop's `reason`, `requirement_changed`, `sync_conflict`, `sync_verify_red`,
or `sync_failed`, and the stop's message as the detail. The first three are
steering triggers, so the watcher then leaves the change alone as "Watcher
leaves a change that needs steering" says. It SHALL then spawn nothing and archive nothing for that change in
that cycle. Any other error the sync throws SHALL halt it the same way with
`sync_failed`. After a sync that merged, the cycle SHALL derive the change's
state again before it picks the task.

#### Scenario: Sync before the first task
- **WHEN** a commit adding `src/other.txt` lands on the default branch after a change is approved into a worktree, and a watcher cycle runs
- **THEN** the branch holds `osq: <id> sync main` before `osq: <id> task 1 verified`, and `src/other.txt` existed in the worktree when the adapter spawned task 1

#### Scenario: No sync between tasks
- **WHEN** the default branch gains a commit after task 1 of a two-task change is verified
- **THEN** task 2 spawns with no sync commit after task 1's commit, and `osq: <id> sync main` comes after task 2's commit and before `osq: <id> archived`

#### Scenario: Conflict halts the change
- **WHEN** the default branch changes the same line of a file that the change's only task changed, after the task is verified and before archive
- **THEN** `.run/regressed/change.md` has reason `sync_conflict` and names the file, no `osq: <id> archived` commit exists, and the worktree's HEAD is the task's commit

#### Scenario: Stacked dependent waits for its dependency
- **WHEN** `002` was cut from `001`'s archive commit, `001` has not landed, and the default branch moved
- **THEN** `002` runs and archives with no sync commit on its branch

#### Scenario: Dependency lands during the dependent's run
- **WHEN** `002` was cut from `001`'s archive commit, and while `002`'s task runs the default branch gains an unrelated commit and `osq land 001` lands `001`
- **THEN** `002` archives after `osq: 002 sync main`, and `osq land 002` then lands it

#### Scenario: Red verify before archive needs steering
- **WHEN** the default branch gains a commit that makes the only task's `verify` exit 1, after the task is verified and before archive
- **THEN** `.run/regressed/change.md` has reason `sync_verify_red`, and later cycles write no commit and spawn nothing for the change
