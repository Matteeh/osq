---
title: A stuck, blocked, or regressed change ends at one action, plan it, and continues after approval
depends_on: ["110", "123", "125"]
verify: pnpm verify
features:
  reads:
    - version-control
    - metrics-and-reporting
    - web-inspection
---
## Goal

osq decides when a human steers a change again, not whoever happens to be
watching (ADR 006 decision 5). Today each way a change gets stuck ends
somewhere different. A stuck task waits for `osq retry` after a human finds
the cause. A blocked task waits for the human to reject the change and replan
it from the queue. A regression at archive waits for `osq retry <id> change`.
None of these hands the human the evidence and a planner at once, and for a
change that runs in a worktree none of them can be answered by revising the
plan: `osq approve` refuses with `branch osq/<folder> already exists`, and
`osq plan <id>` does not find the change at all.

After this change a fixed list of triggers, kept in the status-inspection
spec, marks a change as needing steering: a stuck task, a blocked task, and a
regression. The inbox and `osq inbox` show the change once, with the trigger
and its reason, and one action, `osq plan <id>`. That writes the planning
prompt into the change's own folder, in its worktree when it runs in one, with
each trigger's marker as evidence. The watcher leaves the change alone while
the planner edits it. `osq approve <id>` then lints and seals the revised plan
where the change runs, commits it there, and retires each trigger's marker
the way `osq retry` does. Done tasks stay done, and the run continues from the
first task that is not done. Nothing on this path needs a shell beyond the
commands the inbox names.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests derive each
trigger from markers, show that the watcher leaves a change that needs steering
alone while its folder is edited, show one inbox and dispatch item per such
change with `osq plan <id>`, check the steering prompt and where `osq plan`
writes it, and run a change in a temporary repository from a blocked task
through `osq plan`, an edit in the worktree, and `osq approve` to its archive.

## Non-goals

- The triggers that involve the default branch: a requirement the change
  rewrites that changed there, a code conflict at sync or land, and a red
  verify at sync or land, including planning and running again an archived
  change that halted at land. Each needs a merge or a restart from the default
  branch that replanning tasks alone cannot give. They stay as they are, and a
  new queue item, `default-branch-steering`, covers them.
- The UI action and notifications. Those are later milestones.
- An AI resolver for code conflicts.
- Removing `osq retry`. It stays for a halt that is not a trigger, such as
  `worktree_dirty` or a task whose automatic retries ran out on different
  failures, and for a human who fixed a cause outside osq. The needs-steering
  item does not offer it.
- Rerunning done tasks. A revised plan keeps every done marker; the scope audit
  before each task and the archive's re-run of every task verify still judge
  them.

## Surface

- Added: `steering: { trigger, reason }` (optional field of a needs-you item in `osq --json`, and of a dispatch item in `osq inbox --json`)
- Added: `needs steering: <trigger> (<reason>)` (inbox text row), and `  needs steering: <target> <trigger> (<reason>)` (line of an `osq inbox` card)
- Added: `p` (`osq inbox` card key for `osq plan <id>`)
- Added: `## Steering` (section of the planning prompt for a change that needs steering)
- Added: `  Continues from task <n>` (line of `osq approve` output after steering)
- Changed: `osq plan <id>` reopens an approved change that needs steering, in any tree, and refuses one outside the checkout that needs none
- Changed: `osq approve <id>` approves a change that runs in a worktree and needs steering, instead of refusing with `branch osq/<folder> already exists`
- Changed: `osq lint <id>` finds a change in a worktree or stacked approval
- Changed: the next step of a change that needs steering is `dead (needs steering) — osq plan <id>`
- Changed: a blocked task's inbox item commands `osq plan <id>` instead of `osq reject <id> --reason <text>`, and a stuck task's commands `osq plan <id>` instead of `osq retry <id> <n>`

## Decisions

- ADR 002: unchanged; archive still merges deltas without a model, and a regression it finds is now a steering trigger.
- ADR 004: approval after steering lints with the pinned OpenSpec validator from the checkout, with the change folder read from its worktree, as approval into a worktree already does.
- ADR 005: unchanged; the validator range check runs as before.
- ADR 001: unchanged; no config loading moves.

## Background

**The triggers.** ADR 006 decision 5 lists five. This change takes the three
that happen inside a run, where the branch already holds everything the
revised plan needs:

- `stuck`: a dead task whose active marker has `stuck: true`.
- `blocked`: a dead task whose marker has `reason: blocked`.
- `regression`: any active `.run/regressed/<n>.md`, or `.run/regressed/change.md`
  with reason `verify_red` or `verify_path_missing`, which only the archive
  step writes. A task regression includes a scope regression that failed
  automatic recertification.

Every other halt keeps its item and `osq retry`: the worktree halts
(`worktree_dirty`, `commit_failed`, `sync_conflict`, `sync_failed`,
`dependency_changed`, and the rest), and a dead task that is neither stuck nor
blocked. `deriveSteering` reads only the markers `readChangeFolder` already
captures, so the state stays derived from files.

**Where the planner works.** In the change's own folder where it runs. The
planning prompt names the worktree and says to read code there, and
`osq plan <id> --session` starts the planner with the worktree as its working
directory. Before this change the watcher ran its clean-tree check on a change
with a dead task every cycle, so an edit to the plan would have added a
`worktree_dirty` halt. It now skips a change that needs steering right after
the automatic-retry step, which is also where a second identical death becomes
stuck.

**Approving the revised plan.** ADR 003 decision 4 says re-approval runs
`osq approve` against the worktree and commits the edits with the new hash, as
the first approval did. `approveSteeredChange` does that and then calls
`retrySpec` for each trigger, so the markers are kept under their attempt
numbers exactly as a retry keeps them: a stuck or blocked task runs again with
its revised task file, a regressed task is recertified or requeued as retry
does it, and a change regression is cleared. Lint and the digest use the
checkout as project root, because the pinned validator is the checkout's; a
rough cut that linted with the worktree as root failed for that reason. With
`vcs.enabled` off, approval writes in place as before and then retires the
triggers the same way.

**Found while planning.** `osq plan <id>` looked only in the checkout's changes
directory, so for an approved change, which approval removes from the
checkout, it created a new change named after the id. `osq lint <id>` also
looked only in the checkout. Both now use `findChange`, which knows every tree.

**Measured fallout.** The whole change was applied roughly on 125's tip and run
through both typechecks, lint, the build, and the full suite, UI tests
included, then replayed one task at a time in this order:

| Task | Tests it changes |
|---|---|
| 1 | none |
| 2 | `dispatch-items`, `dispatch-keys`, `dispatch-session`, `inbox`, `inbox-blocked`, `inbox-stuck`, `next-step` |
| 3 | none |
| 4 | `dead-marker-retention` |
| 5 | none |

Most task 2 failures come from tests that stand in for an ordinary halt with a
`verify_red` change regression, a regressed task, or a stuck task. Those are
triggers now, so each such test either uses a reason that is not a trigger,
such as `worktree_dirty`, and keeps testing `osq retry`, or expects the
steering item. A throwaway end-to-end test in the rough cut ran a blocked task,
an edit in the worktree, a watcher cycle that left the change alone, approval,
and the rerun to archive. No requirement is removed, so
`tests/living-specs-delta-equivalence.test.ts` needs no change.
`src/core/status/inbox.ts` has 242 lines, so the steering projection lives in
`blocked-item.ts`. `planCommand` and `runWatcherCycle` are in the function
grandfather list and only grow.

## Contract

### Requirement: A fixed list of triggers asks for steering
A stuck task, a blocked task, and a regression SHALL each mark an approved
change as needing steering, and no other state SHALL.

#### Scenario: Blocked task
- **WHEN** a task dies with `blocked`
- **THEN** its change needs steering, and its inbox item commands `osq plan <id>`

### Requirement: Steering ends at one action and the run continues
For a change that needs steering, `osq plan <id>` SHALL write a prompt with
each trigger's evidence into the change's own folder, the watcher SHALL leave
the change alone, and `osq approve <id>` SHALL seal the revised plan where the
change runs and continue from the first task that is not done.

#### Scenario: Blocked task replanned in its worktree
- **WHEN** task 2 of a change in a worktree dies with `blocked`, a planner edits `tasks/2.md` there, and a human runs `osq approve <id>`
- **THEN** task 1 stays done, task 2 runs again, and the change archives

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/status-inspection/spec.md`: adds "Steering triggers" and "Steering inbox items"; modifies "Human attention inbox projection", "Blocked inbox items", "Stuck and automatic retry inspection", "Stable inbox object", "Dispatch items", "Card keys", "Next step commands", and "Next step detail and format".
- `specs/watcher-and-harness/spec.md`: adds "Watcher leaves a change that needs steering".
- `specs/spec-lint-and-approve/spec.md`: adds "Approval after steering" and "Lint finds a change in any tree"; modifies "Retry approval integrity" and "Approval refusals under version control".
- `specs/cli-foundation/spec.md`: adds "Planning a change that needs steering" and "Steering guidance".

Five tasks, in order. No file is shared between tasks. Each task leaves the
tree compiling and `pnpm verify` green on its own, which the replay above
checked.
