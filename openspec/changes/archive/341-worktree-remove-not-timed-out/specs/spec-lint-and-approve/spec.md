# Spec Delta: spec-lint-and-approve

## MODIFIED Requirements

### Requirement: Approval after a default-branch trigger
`approveSteeredChange` SHALL approve a change whose triggers include a
default-branch trigger through `approveDefaultBranchSteering` in
`src/core/spec/approve-default-branch.ts`. After the running-task refusal, it
SHALL lint and review the digest with the checkout as project root and the
change folder where it is, refusing on lint errors as any approval does, so
the revised plan is judged against the checkout's living specs. It SHALL then
commit the change folder as it stands in the worktree, the planner's edits and
every marker included, with the message `osq: <id> replanned`, authored by
`vcs.author`, so the branch keeps the plan it is leaving. When `status` shows
no path under the change folder, the branch already holds that plan, and it
SHALL skip the commit and go on. Then:

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
  When removing the worktree fails or reaches its time limit, it SHALL stop
  before any other restart step with
  `could not remove worktree <path>: <git's message>`, then a line
  `The change's markers are unchanged. Move <path> aside, run git worktree prune, restart osq watch so it recreates the worktree, then run osq approve <id> again.`
  It SHALL leave the branch, its name and the change folder's markers as
  they were, so that approval, run again, restarts the change.
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

#### Scenario: Worktree removal fails during a restart
- **WHEN** an active change's sync recorded a `sync_conflict` stop, a planner edited `tasks/1.md` in the worktree, the worktree is locked with `git worktree lock`, and a human runs `osq approve <id>`
- **THEN** it exits 1 with an error naming the worktree's path, `cannot remove a locked working tree`, `run git worktree prune` and `restart osq watch`, `.run/regressed/change.md` is byte for byte what it was, `osq/<folder>` still exists and no `osq/<folder>-restarted-1` does; after `git worktree unlock`, a second `osq approve <id>` exits 0 and prints `Restarted from main; kept the old branch as osq/<folder>-restarted-1`
