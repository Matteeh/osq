## MODIFIED Requirements

### Requirement: Approval after steering
`osq approve <id>` SHALL look the change up with `findSteeringChange`, so an
archived change that needs steering is found in its worktree. When the change
is in an osq worktree and `humanSteering` of its derived state, as the
status-inspection requirement "Dead task steering" defines it, is not empty,
`osq approve` SHALL approve the revised plan where the change runs, through
`approveSteeredChange` in `src/core/spec/approve-steer.ts`, instead of
"Approval into a worktree". The triggers below are those `humanSteering`
returns: the derived state's `steering` when it has any, and otherwise one
`dead` trigger per dead task. It SHALL refuse, writing nothing, with
`<folder> has a task running; approve it after the task ends` while any task
of the change runs. When any trigger is a default-branch trigger, as
`isDefaultBranchTrigger` says, it SHALL then approve as "Approval after a
default-branch trigger" says. Otherwise it SHALL:

1. Lint and build the digest with the checkout as project root and the
   worktree's change folder, refusing on lint errors as any approval does.
2. Review the digest, append observed planning records to the worktree's
   folder, hash that folder, and write `.run/approved` and the manifest there
   with `writeApprovalSeal`.
3. Commit the change folder in the worktree with subject `osq: <id> approved`
   and author `vcs.author`, as the first approval did.
4. Retire each trigger, in the order `humanSteering` returns them, through
   `retrySpec` for its target, so each marker is kept under its next attempt
   number exactly as `osq retry` keeps it.

Before step 2 it SHALL keep the bytes of the worktree folder's
`.run/approved`, `.run/manifest.json` and `.run/plan.jsonl`, or that each is
absent. When the step 3 commit fails and the worktree's HEAD, read with
`show('HEAD', '<change folder>/.run/approved')`, does not hold the new hash,
it SHALL put each of those three files
back as it was, deleting one that was absent, leave every other file,
including the plan edits, as it is, retire no trigger, and fail with
`the approved commit failed in <worktree root>: <git error>. The approval seal is undone and the plan edits are kept; run osq approve <id> again.`
where `<git error>` is the commit's error message. `osq approve` then exits 1.
When the commit fails but HEAD already holds the new hash, the commit landed:
it SHALL keep the seal files and continue with step 4 as after a successful
commit.

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

#### Scenario: Dead task approved again in its worktree
- **WHEN** task 1 of a two-task change in a worktree is done, task 2 died with `reason: timeout` and no `stuck`, `tasks/2.md` was edited in the worktree, and a human runs `osq approve <id>`
- **THEN** the worktree's HEAD is a new `osq: <id> approved` commit holding the edited `tasks/2.md`, `.run/approved` holds the edited folder's hash, `.run/dead/2.md` is now `.run/dead/2.1.md`, `.run/done/1` remains, the output says `Continues from task 2`, no branch was created, and the checkout holds no copy of the change

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

#### Scenario: Approved commit fails
- **WHEN** task 1 of a one-task change in a worktree is stuck, `tasks/1.md` was edited in the worktree, the file that `git rev-parse --git-path index.lock` names in the worktree exists, and a human runs `osq approve <id>`
- **THEN** `osq approve` exits 1 with an error holding `the approved commit failed in`, `index.lock` and `run osq approve <id> again`; `.run/approved`, `.run/manifest.json` and `.run/plan.jsonl` hold the same bytes as before the approve; the edited `tasks/1.md` is unchanged; `.run/dead/1.md` is still in place; and the worktree's HEAD is the same commit as before
