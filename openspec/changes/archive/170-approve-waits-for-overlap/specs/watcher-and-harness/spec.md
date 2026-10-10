# Spec Delta: watcher-and-harness

## MODIFIED Requirements

### Requirement: Stacked cut
With `vcs.enabled` and `GitVcs` selected, each watcher cycle SHALL, before it
lists changes, visit every active change in a stacked tree in numeric order,
skipping one that has `.run/regressed/change.md`. For each, it SHALL read
`.run/stacked-on` with `parseStackedOn` and the state of each line's
dependency through "Stack dependency state", and decide:

- a declared line whose dependency is `unapproved`, or `approved` or
  `archived` with a hash other than the recorded one, halts the change with
  `dependency_changed`;
- an overlap line whose change is `unapproved`, or `approved` or `archived`
  with a hash other than the recorded one, is left out of the rest of the
  decision, because the conflict it guarded against is gone;
- otherwise any `approved` dependency means the change waits, unchanged;
- otherwise, when every remaining dependency is `landed`, or none remains,
  the base is the default branch;
- otherwise the base is the `osq/<dependency>` branch of the first
  `archived` dependency, in line order, whose branch holds
  `<archive>/<other>` for every other `archived` dependency and for every
  `landed` overlap dependency. When none does, the change waits, unchanged,
  if any remaining line is an overlap line, and otherwise halts with
  `dependency_diverged`.

To cut, it SHALL create `osq/<folder>` at the base unless that branch
exists, add its worktree at the path "Worktree location" gives unless a
worktree has that branch, and run `vcs.prepare` there as approval does.
Unless the branch's tip already holds `<changes>/<folder>/.run/approved`, it
SHALL then replace the worktree's `<changes>/<folder>` with the stacked copy,
write `.run/base` there with the worktree's HEAD commit, and commit that
folder with subject `osq: <id> approved` and author `vcs.author`. Last, it
SHALL delete the stacked approval directory and log
`stacked <folder> on <base>: worktree <path>`. The same cycle SHALL then run
the change from its worktree. A cut that fails SHALL halt the change with
`stack_cut_failed` and the error's message, and SHALL keep the branch, any
worktree it added, and the stacked approval. After `osq retry <id> change`,
the next cycle cuts again and reuses the branch and worktree that exist. With `vcs.enabled` off, or under `NoVcs`,
the step SHALL do nothing.

#### Scenario: Chain approved at once
- **WHEN** `001-a` and `002-b`, with `depends_on: ["001"]`, are approved one after the other in a temporary repository and `runWatcherOnce` runs with an adapter that edits one file per task
- **THEN** `osq/001-a` ends with `osq: 001 archived`, `osq/002-b`'s first commit is `osq: 002 approved` whose parent is that archive commit and whose `.run/base` names it, `osq/002-b` ends with `osq: 002 archived`, the stacked approval directory is gone, and the checkout's files are unchanged

#### Scenario: Dependency still running
- **WHEN** `002-b` is stacked on `001-a` and `001-a` has a pending task that a cycle does not finish
- **THEN** no branch `osq/002-b` exists and `002-b` has no regression marker

#### Scenario: Dependency landed by hand
- **WHEN** `001-a` archived on its branch, a human squash-merges `osq/001-a` into `main` and commits, and a cycle runs
- **THEN** `osq/002-b` is cut from `main`'s tip and the log names `main` as the base

#### Scenario: Two dependencies on separate branches
- **WHEN** `003-c` depends on `001-a` and `002-b`, both archived on their own branches, and neither branch holds the other's archive
- **THEN** `003-c` halts with `dependency_diverged` and no branch `osq/003-c` exists

#### Scenario: Cut fails and resumes
- **WHEN** `vcs.prepare` exits 1 during the cut, then is fixed, and a human runs `osq retry <id> change`
- **THEN** the first cycle halts with `stack_cut_failed` and keeps the branch, the worktree at the path "Worktree location" gives, and the stacked approval, and the next cycle reuses that worktree and ends with exactly one `osq: <id> approved` commit on the branch and no stacked approval

#### Scenario: Flag off
- **WHEN** `vcs.enabled` is off and a stacked approval directory exists
- **THEN** a cycle creates no branch and writes nothing in that directory

#### Scenario: Overlapping changes approved at once
- **WHEN** `001-a` and `002-b`, both writing `orders` and with `depends_on: []`, are approved one after the other in a temporary repository and `runWatcherOnce` runs with an adapter that edits one file per task
- **THEN** `osq/002-b`'s first commit is `osq: 002 approved` whose parent is `osq/001-a`'s `osq: 001 archived` commit, `osq/002-b` ends with `osq: 002 archived` without a sync of the default branch, and the stacked approval directory is gone

#### Scenario: Overlap lines in the cut
- **WHEN** `003-c`'s `.run/stacked-on` holds only the overlap lines below, each with the hash recorded at approval, and a cycle runs
- **THEN** the cycle does what the table says:

| Overlap lines and their changes | Outcome |
|---|---|
| `001-a`, rejected on its branch | cut from the default branch, no halt |
| `001-a`, approved again under another hash | cut from the default branch, no halt |
| `001-a`, still approved | waits; no branch `osq/003-c` |
| `001-a` and `002-b`, archived on separate branches | waits; no branch `osq/003-c`, no halt |
| `001-a` landed after `003-c` was approved, `002-b` archived on a branch without `001-a`'s archive | waits; no branch `osq/003-c` |
| `001-a` and `002-b`, both landed | cut from the default branch |
