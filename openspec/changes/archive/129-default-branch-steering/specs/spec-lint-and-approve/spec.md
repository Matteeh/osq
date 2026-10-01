## ADDED Requirements

### Requirement: Approval after a default-branch trigger
`approveSteeredChange` SHALL approve a change whose triggers include a
default-branch trigger through `approveDefaultBranchSteering` in
`src/core/spec/approve-default-branch.ts`. After the running-task refusal, it
SHALL lint and review the digest with the checkout as project root and the
change folder where it is, refusing on lint errors as any approval does, so
the revised plan is judged against the checkout's living specs. It SHALL then
commit the change folder as it stands in the worktree, the planner's edits and
every marker included, with the message `osq: <id> replanned`, authored by
`vcs.author`, so the branch keeps the plan it is leaving. Then:

- **Restart**, when any trigger is `conflict`: it SHALL copy the change folder
  aside, remove the worktree, and rename `osq/<folder>` to the lowest free
  `osq/<folder>-restarted-<n>`, counting from 1. It SHALL create
  `osq/<folder>` at the default branch's tip, add the worktree at the same
  path, and run `vcs.prepare` there. It SHALL place the revised folder in the
  worktree's changes directory, with `.run/` holding only the old folder's
  `events/` and `plan.jsonl`, append observed planning records, write
  `.run/approved` and the manifest with `writeApprovalSeal`, write
  `.run/base` and `.run/approver` as "Approval into a worktree" writes them,
  and commit the folder with `osq: <id> approved`. Every task then runs again.
- **Merge**, otherwise: for an archived change it SHALL move the folder from
  the worktree's archive directory to its changes directory. It SHALL put the
  default branch's copy of every living spec in place in the worktree, as
  step 3 of "Default branch sync" does for an active change, write
  `.run/requirements-base` with the default branch's tip, append observed
  planning records, write the seal with `writeApprovalSeal`, and commit the
  folder and the living specs with `osq: <id> approved`. It SHALL then run
  `syncWithDefaultBranch` for the change with `skipVerify`. When that sync
  stops with `sync_conflict`, it SHALL restart as above instead. On any other
  stop it SHALL fail with the stop's message, and the change keeps its
  triggers until it is approved again. After the merge, it SHALL refresh with
  `refreshRecertifiedDoneMarker` every done task's marker whose scope hash
  differs on the merged tree, so the next scope audit does not count osq's own
  merge as a regression; the archive's re-run of every task verify still
  judges those tasks. It SHALL then retire each trigger through `retrySpec` as
  "Approval after steering" does. Done tasks stay done.

`osq approve` SHALL print the approval lines with `  Worktree: <path>` and
`  Branch: osq/<folder>`, then `  Restarted from <default branch>; kept the
old branch as osq/<folder>-restarted-<n>` after a restart or `  Merged
<default branch> into osq/<folder>` after a merge, then `  Continues from task
<n>`. It SHALL write nothing to the checkout and never write the default
branch.

#### Scenario: Conflict restarts the change
- **WHEN** an archived change's land recorded a `sync_conflict` stop on `src/one.txt`, a planner edited `tasks/1.md` in the worktree's archive folder, and a human runs `osq approve <id>`
- **THEN** `osq/<folder>-restarted-1` ends with `osq: <id> replanned`, `osq/<folder>` is the default branch's tip plus one `osq: <id> approved` commit holding the edited `tasks/1.md` in the changes directory with no done marker, `.run/base` holds the default branch's tip, and the output says `Continues from task 1`

#### Scenario: Restarted change lands
- **WHEN** that change is approved again and watcher cycles run until it archives, and a human runs `osq land <id>`
- **THEN** every task ran again, and the land succeeds

#### Scenario: Red verify reopens the change
- **WHEN** an archived two-task change's land recorded a `sync_verify_red` stop, a planner added task 3 in the worktree's archive folder, and a human runs `osq approve <id>`
- **THEN** the folder is in the worktree's changes directory, the branch holds `osq: <id> approved` and then `osq: <id> sync main`, `.run/done/1` and `.run/done/2` remain, the regression is kept as `.run/regressed/change.1.md`, and the output says `Merged main into osq/<folder>` and `Continues from task 3`

#### Scenario: Reopened change runs and archives
- **WHEN** that change is approved again and watcher cycles run
- **THEN** tasks 1 and 2 do not spawn, task 3 spawns and is verified, and the change archives in its worktree

#### Scenario: Changed requirement judged against the default branch
- **WHEN** an active change halted with `requirement_changed` on `orders: Order totals`, a planner rewrote that requirement's delta against the default branch's text, and a human runs `osq approve <id>`
- **THEN** `.run/requirements-base` holds the default branch's tip, the branch holds `osq: <id> sync main`, and a later sync does not stop on `Order totals`

#### Scenario: Merge that conflicts restarts
- **WHEN** a change halted with `requirement_changed`, and the default branch also changed a line the change changed
- **THEN** approval restarts the change and the output names `osq/<folder>-restarted-1`

## MODIFIED Requirements

### Requirement: Approval after steering
`osq approve <id>` SHALL look the change up with `findSteeringChange`, so an
archived change that needs steering is found in its worktree. When the change
is in an osq worktree and its derived state has `steering`, `osq approve`
SHALL approve the revised plan where the change runs, through
`approveSteeredChange` in `src/core/spec/approve-steer.ts`, instead of
"Approval into a worktree". It SHALL refuse, writing nothing, with
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
`osq lint <id>` SHALL resolve each explicit id through `findSteeringChange`
first, so a change that runs in a worktree, waits in a stacked approval, or
archived in a worktree and needs steering is linted where it is, and SHALL
fall back to the checkout's changes directory as before when it finds none. It SHALL lint every folder with the directory it runs
in as project root, because the pinned OpenSpec validator is that
directory's. `osq lint` without ids SHALL lint the checkout's change folders as
before.

#### Scenario: Lint a change in its worktree
- **WHEN** a change has been approved into a worktree, removed from the checkout, and its task file in the worktree has a finding
- **THEN** `osq lint <id>` in the checkout reports that finding for the worktree's folder and exits 1

#### Scenario: Lint an archived change that needs steering
- **WHEN** an archived change's land recorded a `sync_conflict` stop, and its task file in the worktree's archive folder has a finding
- **THEN** `osq lint <id>` in the checkout reports that finding for that folder and exits 1
