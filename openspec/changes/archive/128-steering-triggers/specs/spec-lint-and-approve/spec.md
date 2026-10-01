## ADDED Requirements

### Requirement: Approval after steering
When the change locations module finds the change in an osq worktree and its
derived state has `steering`, `osq approve` SHALL approve the revised plan
where the change runs, through `approveSteeredChange` in
`src/core/spec/approve-steer.ts`, instead of "Approval into a worktree". It
SHALL refuse, writing nothing, with
`<folder> has a task running; approve it after the task ends` while any task
of the change runs. Otherwise it SHALL:

1. Lint and build the digest with the checkout as project root and the
   worktree's change folder, refusing on lint errors as any approval does.
2. Review the digest, append observed planning records to the worktree's
   folder, hash that folder, and write `.run/approved` and the manifest there
   with `writeApprovalSeal`.
3. Commit the change folder in the worktree with subject `osq: <id> approved`
   and author `vcs.author`, as the first approval did.
4. Retire each trigger, in the order `deriveSteering` returns them, through
   `retrySpec` for its target, so each marker is kept under its next attempt
   number exactly as `osq retry` keeps it.

It SHALL write nothing to the checkout and create no branch or worktree. Done
markers SHALL stay. `osq approve` SHALL print the approval lines, including
`  Worktree: <path>` and `  Branch: osq/<folder>`, and then
`  Continues from task <n>`, naming the first task that is not done after the
triggers are retired, when there is one. With `vcs.enabled` off or `NoVcs`
selected, a change that needs steering SHALL be approved in place as before,
and its triggers then retired the same way, with the same line.

#### Scenario: Blocked task approved again in its worktree
- **WHEN** task 1 of a two-task change in a worktree is done, task 2 died with `blocked`, `tasks/2.md` was edited in the worktree, and a human runs `osq approve <id>`
- **THEN** the worktree's HEAD is a new `osq: <id> approved` commit holding the edited `tasks/2.md`, `.run/approved` holds the edited folder's hash, `.run/dead/2.md` is now `.run/dead/2.1.md`, `.run/done/1` remains, the output says `Continues from task 2`, and the checkout holds no copy of the change

#### Scenario: The run continues
- **WHEN** that change is approved again and watcher cycles run
- **THEN** task 1 does not run again, task 2 runs and is verified, and the change archives in its worktree

#### Scenario: Change regression retired
- **WHEN** a change in a worktree has `.run/regressed/change.md` with `reason: verify_red` and every task done, and it is approved again after a new task 3 was added
- **THEN** the regression is kept as `.run/regressed/change.1.md` and the output says `Continues from task 3`

#### Scenario: Task running
- **WHEN** a change that needs steering has a live running marker for another task
- **THEN** approve fails with `has a task running` and writes nothing

#### Scenario: Version control off
- **WHEN** `vcs.enabled` is off and a change whose task 1 is stuck is approved again
- **THEN** the seal is rewritten in place and `.run/dead/1.md` is now `.run/dead/1.1.md`

### Requirement: Lint finds a change in any tree
`osq lint <id>` SHALL resolve each explicit id through `findChange` first, so
a change that runs in a worktree or waits in a stacked approval is linted where
it is, and SHALL fall back to the checkout's changes directory as before when
`findChange` finds none. It SHALL lint every folder with the directory it runs
in as project root, because the pinned OpenSpec validator is that
directory's. `osq lint` without ids SHALL lint the checkout's change folders as
before.

#### Scenario: Lint a change in its worktree
- **WHEN** a change has been approved into a worktree, removed from the checkout, and its task file in the worktree has a finding
- **THEN** `osq lint <id>` in the checkout reports that finding for the worktree's folder and exits 1

## MODIFIED Requirements

### Requirement: Retry approval integrity
The retry transition SHALL compare the current deterministic change-folder hash
with `.run/approved` before changing any marker or appending an event. A missing
or mismatched approval SHALL leave failure state intact and identify
`osq approve <id>` as the remediation. Approval SHALL update approval artifacts
without renaming an active dead or regressed marker that is not a steering
trigger; only retry may retire one. Approval of a change that needs steering
SHALL retire each trigger's marker, and it SHALL do so through the retry
transition after the new seal is written, as "Approval after steering" says.

#### Scenario: Retry matches approval
- **WHEN** an active failed change still matches its approved hash
- **THEN** retry may proceed without changing the approval marker

#### Scenario: Retry finds authored drift
- **WHEN** authored change-folder content no longer matches `.run/approved`
- **THEN** retry refuses before mutation and directs the user to approve the change again

#### Scenario: Reapproval retains active failure
- **WHEN** `osq approve` seals a change whose active dead marker has `reason: verify_red` without `stuck`, and whose `.run/regressed/change.md` has `reason: worktree_dirty`
- **THEN** approval leaves both markers active for an explicit retry or rejection decision

### Requirement: Approval refusals under version control
With `vcs.enabled` and `GitVcs` selected, approve SHALL refuse, after lint and
before the digest, writing nothing, when:

- HEAD is not on the default branch and `--base-ok` is not passed, with
  `HEAD is on <branch>, not the default branch <default>; pass --base-ok to approve from it`,
  where a detached HEAD reads `a detached HEAD`;
- uncommitted changes in the checkout, by path or rename source, are covered
  by any task's `scope` and `--ignore-dirty` is not passed, with
  `uncommitted changes in task scope: <paths>; commit them or pass --ignore-dirty`,
  paths sorted and comma-separated;
- branch `osq/<folder>` already exists and "Rejected branch kept at approval"
  does not rename it, with `branch osq/<folder> already exists`.

A `depends_on` entry that is approved and has not landed is not a refusal;
"Stacked approval" says what approve does instead. A change that runs in a
worktree and needs steering is not a refusal either; "Approval after steering"
says what approve does instead, and none of these refusals applies to it.

#### Scenario: Off the default branch
- **WHEN** approve runs from branch `topic` with `vcs.enabled`
- **THEN** it fails with the default-branch message naming `topic` and `main`, and with `--base-ok` it succeeds

#### Scenario: Dirty scope
- **WHEN** a file matching a task's `scope` has uncommitted edits
- **THEN** approve fails naming that file, and with `--ignore-dirty` it succeeds

#### Scenario: Branch exists
- **WHEN** `osq/<folder>` already exists
- **THEN** approve fails with `branch osq/<folder> already exists` and creates no worktree

#### Scenario: Unlanded dependency
- **WHEN** the change depends on another change that is approved and still active
- **THEN** approve does not fail, creates no branch, and records a stacked approval naming the dependency's folder

#### Scenario: Running change that needs no steering
- **WHEN** a change runs in a worktree with a pending task and no trigger, and a human runs `osq approve <id>`
- **THEN** approve fails with `branch osq/<folder> already exists` and the worktree's HEAD is unchanged
