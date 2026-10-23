## MODIFIED Requirements

### Requirement: Planning a change that needs steering
`osq plan <id>` SHALL first look the change up with `findSteeringChange`,
which knows every tree and finds an archived change in a worktree that needs
steering. When the change's derived state has `steering`, as the
status-inspection requirement "Steering triggers" defines it, planning SHALL
reopen that change's own folder, wherever it is, and build the usual prompt
sections for it, then append a `## Steering` section. When an approved
change in an osq worktree has no `steering` but `humanSteering`, as the
status-inspection requirement "Dead task steering" defines it, returns
`dead` triggers, planning SHALL reopen it the same way, with those triggers
in its `## Steering` section. When an approved change outside the checkout,
in a worktree or a stacked approval, has neither, `osq plan <id>` SHALL fail
with
`<folder> is approved and needs no steering; osq plan <id> reopens an approved change only when it needs steering`
and write nothing. When no active change matches the name and an archived
change in any tree does, as `matchesFolder` matches it, `osq plan <id>`
SHALL write nothing, create no change folder, and fail with
`<folder> has <state>, so osq plan <id> has nothing to reopen. Start new work with an item in <queue> and osq plan --next, or with osq plan <name> --brief <file>.`
There `<state>` is `landed` when `readDependencyState` reads the folder as
`landed` and `archived` otherwise, and `<queue>` is the queue file's path
relative to the project root, such as `openspec/queue.md`. Any other change
in the checkout without `steering`, or one neither lookup finds, SHALL be
planned exactly as before.

The `## Steering` section SHALL hold, in order: the line
`osq halted this change and asks you to revise its plan.`, or
`A task of this change died, and a human asked to revise its plan.` when
every trigger is `dead`; for each trigger in `humanSteering` order, a
`### <describeTrigger>` heading, the line
`Evidence: <absolute path of the trigger's marker>`, and the marker's body
without its frontmatter inside a fenced block. Under a `requirement_changed`
trigger, for each requirement `changedRequirements` reports between the
requirements base and the default branch's tip, it SHALL add a
`#### <capability>: <requirement> on <default branch>` heading and that
requirement's full text on the default branch inside a fenced block, or the
line `Removed on <default branch>.` when the default branch lacks it. Then come
these three lines, with
the tree root, folder path, done task numbers comma-separated or `none`, and
id filled in:

- `The change runs in <tree root>; read its code there. Edit only <folder path>.`
- `Done tasks stay done: <tasks>. Add a task for new work instead of rewriting a done one.`

When a trigger is a default-branch trigger, a fourth line SHALL follow the
first: `Approval restarts osq/<folder> from <default branch>, and every task
runs again.` when any trigger is `conflict`, and otherwise `Approval merges
<default branch> into osq/<folder> without running verify; add a task that
makes the merged tree pass.` After a `conflict` trigger, the done-tasks line
SHALL read `Every task runs again after the restart. Revise any task the
conflict shows is wrong.`
- ``Run `osq lint <id>` and fix every finding. A human runs `osq approve <id>`, and the run continues from the first task that is not done.``

The default handoff SHALL write `plan-prompt.md` into the change's own folder
and print its one line as before. `--print` SHALL print the same prompt.
`--session` SHALL start the planner with the change's tree root as its working
directory, and read planning usage from that directory.

#### Scenario: Plan a blocked change in its worktree
- **WHEN** task 2 of a change that runs in a worktree died with `blocked` and the stated need `Needs src/three.txt`, and a human runs `osq plan <id>` in the checkout
- **THEN** the worktree's change folder holds `plan-prompt.md` ending in the `## Steering` section with `### task 2 blocked (blocked)`, the dead marker's path, `Needs src/three.txt`, and `Done tasks stay done: 1.`, the checkout holds no copy of the change, and no new change folder was created

#### Scenario: Plan a dead task in its worktree
- **WHEN** task 1 of a change that runs in a worktree is done, task 2 died with `reason: timeout` and the body `Agent timed out`, without `stuck`, and a human runs `osq plan <id>` in the checkout
- **THEN** the worktree's change folder holds `plan-prompt.md` ending in the `## Steering` section with `A task of this change died, and a human asked to revise its plan.`, `### task 2 dead (timeout)`, the dead marker's path, `Agent timed out`, and `Done tasks stay done: 1.`, the checkout holds no copy of the change, and no new change folder was created

#### Scenario: Session in the worktree
- **WHEN** `osq plan <id> --session` runs for a change in a worktree that needs steering, with a fake interactive adapter
- **THEN** the adapter is started with the worktree root as `cwd` and a prompt that holds the `## Steering` section

#### Scenario: Approved change needs no steering
- **WHEN** a change runs in a worktree with a pending task and no trigger, and a human runs `osq plan <id>`
- **THEN** the command fails with `needs no steering` and no file changes in the worktree or the checkout

#### Scenario: Plan an archived change after a land conflict
- **WHEN** `osq land <id>` recorded a `sync_conflict` stop on `src/one.txt` for an archived change, and a human runs `osq plan <id>` in the checkout
- **THEN** the worktree's archive folder holds `plan-prompt.md` ending in the `## Steering` section with `### change conflict (sync_conflict)`, `src/one.txt`, `Approval restarts osq/<folder> from main, and every task runs again.`, and `Every task runs again after the restart.`, and no new change folder was created

#### Scenario: Changed requirement text in the prompt
- **WHEN** an active change in a worktree halted with `requirement_changed` on `orders: Order totals`, which the default branch rewrote to hold `rounded to cents`
- **THEN** its `## Steering` section holds `#### orders: Order totals on main` and a fenced block holding `rounded to cents`

#### Scenario: Plan a finished change
- **WHEN** a human runs `osq plan 1` in the checkout, with the row's state for change `001-order-flow` and no active change folder
- **THEN** the command fails with the row's message, the changes directory holds the same folders as before, and no file changes in the checkout:

| State | Message |
|---|---|
| landed: the default branch holds `openspec/changes/archive/001-order-flow`, and its worktree is gone | `001-order-flow has landed, so osq plan 1 has nothing to reopen. Start new work with an item in openspec/queue.md and osq plan --next, or with osq plan <name> --brief <file>.` |
| archived in the checkout with `vcs.enabled` off | `001-order-flow has archived, so osq plan 1 has nothing to reopen. Start new work with an item in openspec/queue.md and osq plan --next, or with osq plan <name> --brief <file>.` |
