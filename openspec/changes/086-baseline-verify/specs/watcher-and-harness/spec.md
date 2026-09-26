## ADDED Requirements

### Requirement: Baseline key
<!-- source: src/watcher/baseline-key.ts, tests/baseline-key.test.ts -->
Under `GitVcs`, a baseline key SHALL hold HEAD's commit and a SHA-256 digest of
every status entry outside `.run/` folders, each as its path, status code, and
content hash, with null for a deleted file, in path order. Under `NoVcs`, or
when HEAD has no commit, there SHALL be no key.

#### Scenario: Same tree
- **WHEN** the key is read twice with no file changed, and only a `.run/` file written in between
- **THEN** both keys are equal

#### Scenario: Edited untracked file
- **WHEN** an untracked file outside `.run/` changes between two reads
- **THEN** the digests differ and the commits are equal

#### Scenario: Outside git
- **WHEN** the key is read under `NoVcs`
- **THEN** there is no key

### Requirement: Baseline verify before a change's first task
<!-- source: src/watcher/baseline.ts, src/watcher/runner.ts, tests/baseline-verify.test.ts -->
When `gates.baselineVerify` is set and none of the change's task streams holds
a `started` event, `runTask` SHALL settle the baseline before its pre-spawn
verify or agent spawn. It SHALL run the command in the project root
with `timeouts.verifyTimeoutSeconds` and without `OSQ_CHANGE`, and append one
`baseline_ran` event to the change stream with `outcome`, `command`, `commit`,
`treeDigest`, `exitCode`, and `durationSeconds`. When the command fails, the
task SHALL die with `baseline_red`. Its dead marker SHALL start with "tree was
red before this change started", then name the command, its exit code, and
`osq retry <id> <n>`, then carry the output. The outcome line SHALL end with
"tree was red before this change started". `baseline_red` SHALL NOT be retried
automatically.

#### Scenario: Green baseline
- **WHEN** the baseline command exits 0 before task 1 of a change
- **THEN** a `baseline_ran` event with `outcome: passed` precedes task 1's `started` event

#### Scenario: Retry after a red baseline
- **WHEN** a human fixes the tree and runs `osq retry <id> 1` after `baseline_red`
- **THEN** the baseline runs again before task 1 spawns

#### Scenario: Change already started
- **WHEN** task 2 of a change runs after task 1 started
- **THEN** no baseline runs and no `baseline_ran` event is appended

#### Scenario: Gate unset
- **WHEN** `gates.baselineVerify` is unset
- **THEN** no baseline runs and no `baseline_ran` event is appended

### Requirement: Baseline reuse
<!-- source: src/watcher/baseline.ts, tests/baseline-verify.test.ts -->
Before running the command, the watcher SHALL find the latest `baseline_ran`
event with outcome `passed` or `reused` across the change streams of every
active and archived change. When that event's command equals the configured
command, and its commit and digest equal the current baseline key, the watcher
SHALL NOT run the command. It SHALL append a `baseline_ran` event with
`outcome: reused` and `reusedFrom`, the folder name of the change that
recorded it. Without a key, the command SHALL always run.

#### Scenario: Unchanged tree
- **WHEN** a second change's first task starts in a git repository whose HEAD and dirty files are unchanged since the first change's green baseline
- **THEN** its `baseline_ran` event has `outcome: reused` and names the first change, and the command did not run

#### Scenario: Changed file
- **WHEN** a tracked file changed after the first change's green baseline
- **THEN** the second change's baseline runs the command
