## ADDED Requirements

### Requirement: Stacked cut
<!-- source: src/watcher/loop.ts, src/watcher/stack-run.ts, src/core/spec/stack-cut.ts, tests/stack-run.test.ts -->
With `vcs.enabled` and `GitVcs` selected, each watcher cycle SHALL, before it
lists changes, visit every active change in a stacked tree in numeric order,
skipping one that has `.run/regressed/change.md`. For each, it SHALL read
`.run/stacked-on` and the state of each line's dependency through "Stack
dependency state", and decide:

- a dependency that is `unapproved`, or `approved` or `archived` with a hash
  other than the recorded one, halts the change with `dependency_changed`;
- otherwise any `approved` dependency means the change waits, unchanged;
- otherwise, when every dependency is `landed`, the base is the default
  branch;
- otherwise the base is the `osq/<dependency>` branch of the first
  `archived` dependency, in line order, whose branch holds
  `<archive>/<other>` for every other `archived` dependency, and when none
  does, the change halts with `dependency_diverged`.

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
`stack_cut_failed` and the error's message and keep the stacked approval.
After `osq retry <id> change`, the next cycle cuts again and reuses the
branch and worktree that exist. With `vcs.enabled` off, or under `NoVcs`,
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
- **THEN** the first cycle halts with `stack_cut_failed` and keeps the stacked approval, and the next cycle ends with exactly one `osq: <id> approved` commit on the branch and no stacked approval

#### Scenario: Flag off
- **WHEN** `vcs.enabled` is off and a stacked approval directory exists
- **THEN** a cycle creates no branch and writes nothing in that directory

### Requirement: Stacked halt
<!-- source: src/watcher/stack-run.ts, src/watcher/worktree-run.ts, tests/stack-run.test.ts -->
To halt a stacked change, the watcher SHALL write `.run/regressed/change.md`
in the stacked copy and append its `regressed` event and log line exactly as
"Worktree halt" does. The detail for `dependency_changed` SHALL be
`<dependency> was rejected or is no longer approved; approve <id> again` for
an `unapproved` dependency, and
`<dependency> was approved again after <id>; approve <id> again` for a changed
hash. The detail for `dependency_diverged` SHALL be
`<dependencies> archived on separate branches; land one and approve <id> again`,
the dependencies joined with ` and `. Approving the change again replaces the
stacked approval, and the halt with it.

#### Scenario: Dependency rejected before it lands
- **WHEN** `002-b` is stacked on `001-a` and `osq/001-a`'s tip holds `001-a` only under the rejected directory
- **THEN** a cycle halts `002-b` with `dependency_changed`, its marker contains `approve 002 again`, and no branch `osq/002-b` exists

#### Scenario: Dependency approved again
- **WHEN** the hash `.run/stacked-on` records for `001-a` differs from `001-a`'s current approved hash
- **THEN** a cycle halts `002-b` with `dependency_changed` and the approved-again detail

#### Scenario: Approve again clears the halt
- **WHEN** `002-b` halted because `001-a` was rejected, and a human approves `002-b` again
- **THEN** `osq/002-b` is cut from HEAD with its worktree, and no stacked approval of `002-b` remains

### Requirement: Rejection under version control
<!-- source: src/core/lifecycle/reject.ts, src/core/lifecycle/reject-vcs.ts, src/cli/reject.ts, tests/reject-worktree.test.ts -->
With `vcs.enabled` and `GitVcs` selected, after `rejectSpec` moves a change
in a worktree tree into that tree's rejected directory and records the
rejection, it SHALL commit, in the worktree, every path status lists under
the change's old folder and its rejected folder, with subject
`osq: <id> rejected`, the reason and `rejected to <path>` as body lines, the
trailer `Osq-Change: <folder>`, and author `vcs.author`, built by
`formatCommitMessage`. It SHALL then remove the worktree through
`worktreeRemove`, never by force, and keep the branch. When the worktree
still has other changes, or the commit or the removal fails, it SHALL keep
the worktree and report why. `osq reject` SHALL print
`  Worktree removed: <path>` or `  Worktree kept: <path> (<why>)`, then
`  Branch kept: osq/<folder>`. For a change in a stacked tree, `rejectSpec`
SHALL apply the same eligibility rules, then delete the stacked approval
directory, move nothing, and write no rejection record, and `osq reject`
SHALL print `  Withdrew stacked approval: <path>` in place of its
`Destination` line.

#### Scenario: Reject removes a clean worktree
- **WHEN** a change in a worktree has a dead task and a human runs `osq reject <id> --reason stop`
- **THEN** the branch's newest commit is `osq: <id> rejected` holding the folder under the rejected directory and not under the changes directory, the worktree's directory and its `worktreeList` entry are gone, the branch remains, and the checkout's files are unchanged

#### Scenario: Dirty worktree kept
- **WHEN** the rejected change's worktree also has a modified file outside the change folder
- **THEN** the rejection commit is made without that file, the worktree and the file remain, and the output has a `Worktree kept:` line naming the worktree

#### Scenario: Not recreated after reject
- **WHEN** a change was rejected and its worktree removed, and `osq watch --once` runs
- **THEN** no worktree is created for its branch

#### Scenario: Reject a halted stacked change
- **WHEN** a stacked change halted with `dependency_changed` is rejected
- **THEN** its stacked approval directory is gone, no branch exists for it, the checkout's copy is unchanged, and the output has the `Withdrew stacked approval:` line

## MODIFIED Requirements

### Requirement: Lifecycle commands in a worktree
<!-- source: src/core/lifecycle/reject.ts, src/core/lifecycle/retry.ts, tests/worktree-lifecycle.test.ts -->
`retry`, `reject`, `done`, and `verified` SHALL act on the folder the change
locations module returns, so for a change that runs in a worktree they write
their markers in the worktree and never in the checkout. `rejectSpec` SHALL
read a change's markers in the change's own tree, move the change into that
tree's rejected directory, and then commit and remove the worktree as
"Rejection under version control" says. `retrySpec`'s recertification SHALL
run the task's verify and hash its scope in the change's own tree.

#### Scenario: Reject a dead change in a worktree
- **WHEN** a change in a worktree has a dead task and a human runs `osq reject <id> --reason stop`
- **THEN** the change's branch holds the folder and its `.run/rejected.md` under the rejected directory, and the checkout's copy of the change and its rejected directory are unchanged

#### Scenario: Recertify in the worktree
- **WHEN** a done task in a worktree has a scope regression and its verify passes only in the worktree
- **THEN** `osq retry <id> <n>` recertifies it

#### Scenario: Manual done in the worktree
- **WHEN** a human runs `osq done <id> <n> --manual <reason>` for a change in a worktree
- **THEN** `.run/done/<n>` is written in the worktree's change folder and not in the checkout's copy
