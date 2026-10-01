## MODIFIED Requirements

### Requirement: Planning a change that needs steering
`osq plan <id>` SHALL first look the change up with `findSteeringChange`,
which knows every tree and finds an archived change in a worktree that needs
steering. When the change's derived state has `steering`, as the
status-inspection requirement "Steering triggers" defines it, planning SHALL
reopen that change's own folder, wherever it is, and build the usual prompt
sections for it, then append a `## Steering` section. When an approved change
outside the checkout, in a worktree or a stacked approval, has no `steering`,
`osq plan <id>` SHALL fail with
`<folder> is approved and needs no steering; osq plan <id> reopens an approved change only when it needs steering`
and write nothing. A change in the checkout without `steering`, or one
`findSteeringChange` does not find, SHALL be planned exactly as before.

The `## Steering` section SHALL hold, in order: the line
`osq halted this change and asks you to revise its plan.`; for each trigger in
`deriveSteering` order, a `### <describeTrigger>` heading, the line
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

### Requirement: Steering guidance
README.md SHALL describe steering in its `## Gates and permissions` section as
a `**Steering.**` bullet: the five triggers, naming the default-branch
triggers as a conflict, a changed requirement, or a red verify or check when
osq merges the default branch, at the watcher's sync or at `osq land`, which
records an archived change's stop on its branch, the one inbox item with its
trigger, reason, and `osq plan <id>`, the prompt written into the change's own
folder with each trigger's marker as evidence, `--session` starting the planner
there, the watcher leaving the change alone, and `osq approve <id>` sealing the
revised plan where the change runs, keeping done tasks, retiring each trigger
as `osq retry` does, and continuing from the first task that is not done.
The bullet SHALL also say that approval after a conflict restarts the branch
from the default branch, keeps the old branch, and runs every task again, and
that approval after the other default-branch triggers merges the default
branch without running verify and keeps done tasks. The `## Version control`
paragraph on syncing SHALL name the reasons `sync_conflict`,
`requirement_changed`, and `sync_verify_red`, and say each asks for steering
with `osq plan <id>`. The
loop diagram SHALL show the steering step. The README's paragraphs on stuck and
blocked tasks and its inbox section SHALL say that such a change needs steering
and name `osq plan <id>`, and SHALL keep saying that `osq retry <id> <n>`
still retries a stuck task and that the stuck field is optional. CHANGELOG.md's
Unreleased section SHALL say what changed for a stuck, blocked, or regressed
change, and for a change the default branch stops.

#### Scenario: README steering bullet
- **WHEN** README.md is read
- **THEN** its `## Gates and permissions` section holds a `**Steering.**` bullet naming `stuck`, `blocked`, `osq plan <id>`, `osq approve <id>`, and the first task that is not done

#### Scenario: README default-branch steering
- **WHEN** README.md is read
- **THEN** its `**Steering.**` bullet names `conflict`, `requirement_changed`, `sync_verify_red`, `osq land`, and a restart from the default branch, and its sync paragraph names `requirement_changed` and `sync_verify_red`
