## ADDED Requirements

### Requirement: Parallel change lanes
The watcher SHALL run each approved change's next task in a lane of its own,
with at most `maxConcurrency` lanes at once, a value under 1 counting as 1.
A cycle SHALL visit the active changes in numeric order and, when every lane
is taken, wait for one to finish before it starts the next task. No lane SHALL
start while a pause is active. `runWatcherCycle` and `runWatcherOnce` SHALL
return only after their lanes finish; a running watcher's lanes SHALL outlive
the cycle that started them.

#### Scenario: Two independent changes at once
- **WHEN** two approved changes whose deltas share no capability each have a pending task, `maxConcurrency` is 2, and `runWatcherOnce` runs
- **THEN** both tasks' spawns are running at the same time, and both changes are archived

#### Scenario: The cap holds
- **WHEN** three approved changes whose deltas share no capability each have a pending task, `maxConcurrency` is 2, and `runWatcherOnce` runs
- **THEN** never more than two spawns run at the same time, and all three tasks run in that one `runWatcherOnce`

#### Scenario: One lane runs as before
- **WHEN** changes `001` and `002`, approved and sharing no capability, each have a pending task, `maxConcurrency` is 1, and `runWatcherOnce` runs
- **THEN** no two spawns run at the same time, and `001`'s task spawns before `002`'s

#### Scenario: A pause stops new starts
- **WHEN** two approved changes each have a pending task, one of them holds a `.run/paused.md` whose `until` is an hour away, `maxConcurrency` is 3, and `runWatcherCycle` runs
- **THEN** no task spawns and the summary's `tasksRun` is 0

#### Scenario: Lanes outlive a cycle
- **WHEN** `startWatcher` runs with `maxConcurrency` 2 over two approved changes, and the first change's task does not end until the second change's task has spawned
- **THEN** the second change's task spawns while the first's runs, and the first change's task spawns once

### Requirement: What a lane runs
A lane SHALL run the pre-dispatch scope audit, the task, the mutation check,
the task's commit or dead record, and the archive of a change whose last task
passed. While a change's lane runs, every cycle SHALL leave that change alone:
no reaping, retry, steering, worktree check, commit or archive runs for it. A
change in a stacked tree SHALL start no task; it waits for "Stacked cut" to
give it a worktree. The running locks under `.run/running/` SHALL stay the
record of what runs.

#### Scenario: A stacked change waits
- **WHEN** changes `001` and `002` share a capability, `002` is approved after `001` and so stacked on it, `maxConcurrency` is 3, and `runWatcherOnce` runs
- **THEN** `002`'s task spawns once, after `001`'s task has ended, and never in `002`'s stacked tree

### Requirement: Stopping waits for running lanes
An error in one lane SHALL be logged as a watcher error and end that lane
alone; a stale or new build found in a lane SHALL stop the watcher as the
build check does. When the watcher stops, by abort, SIGINT or a build check,
it SHALL start no task, and `startWatcher`'s promise and the build check's
exit SHALL wait until every lane has finished. A second SIGINT SHALL still
exit with 130 at once.

#### Scenario: A new build waits for running lanes
- **WHEN** `startWatcher` runs with `maxConcurrency` 2 over two approved changes, and its build check throws `BuildChangedError` once a task has spawned
- **THEN** `exit` is called with 75 only after every spawned task has ended, and no task spawns after the check threw

#### Scenario: Abort waits for running lanes
- **WHEN** a watcher's abort signal fires while a lane's task runs
- **THEN** `startWatcher`'s promise resolves only after that task has ended, and no task spawns after the abort
