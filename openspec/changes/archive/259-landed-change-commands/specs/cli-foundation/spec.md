## MODIFIED Requirements

### Requirement: Explicit retry command
The CLI SHALL provide `osq retry <id> <target>` for an active change, where the
target is a numeric task or literal `change`. Retry SHALL require matching
approval, an active dead or regressed marker, and no running marker for the
target. It SHALL refuse invalid states without mutation and direct missing or
stale approval to `osq approve <id>` without approving for the caller.

A numeric task carrying `reason: scope_regression` and an automated done marker
SHALL be recertified by running its verify command without spawning an agent.
A pass SHALL refresh canonical done and report recertification without advancing
execution attempts. A failure SHALL requeue the task and report that agent work
is pending. Dead tasks, other regression reasons, and change-level regressions
SHALL retain their established retry behavior. No new retry flag SHALL exist.

When no active change matches the id, retry SHALL look for an archived change
that an osq worktree holds, the first in `changeTrees` order whose folder
matches the id as `matchesFolder` does. For such a change, `osq retry <id>
change` SHALL check its approval and its `.run/regressed/change.md` as for an
active change. It SHALL then retain the marker and append the `retry` event
through the same preserving transition. Then it SHALL commit the retained
marker, the removed `change.md` and `.run/events/change.jsonl` on the
change's branch `osq/<folder>` with the message `osq: <id> land retry`,
authored by `vcs.author`. That leaves the worktree's status empty, so the
next `osq land <id>` runs its sync again. When that commit fails, retry SHALL
put the marker and the event file back as they were and fail with `osq could
not record the retry: <git output>`. A numeric target on such a change SHALL
fail without mutation with `<folder> has archived; osq retry clears only its
land stop: osq retry <id> change`.

#### Scenario: Retrying a failed task
- **WHEN** a user retries an approved dead or non-scope-regressed numeric task that is not running
- **THEN** the CLI performs the existing preserving retry transition and reports its next execution attempt

#### Scenario: Recertifying a scope-regressed task
- **WHEN** a user retries an approved numeric task with an active scope regression and automated done marker
- **THEN** the CLI reports either successful human recertification or requeue after running verification under the configured timeout

#### Scenario: Retrying another task regression
- **WHEN** a user retries an approved numeric task with a non-scope regression
- **THEN** the CLI performs the existing preserving retry transition without recertification verification

#### Scenario: Retrying a change-level regression
- **WHEN** a user runs `osq retry <id> change` for an approved change with `.run/regressed/change.md` and nothing running
- **THEN** the CLI clears the active regression through the preserving retry transition

#### Scenario: Approval remediation
- **WHEN** the approval marker is missing or its hash differs from the authored change folder
- **THEN** retry exits non-zero without mutation and names `osq approve <id>` as the next step

#### Scenario: Retrying a land stop on an archived change
- **WHEN** an archived one-task change's `osq land <id>` stopped with `sync_verify_red` because the default branch added `src/two.txt` holding `bad`, the default branch then changed `src/two.txt` to `good`, and a human runs `osq retry <id> change` in the checkout
- **THEN** retry prints `Retried <id> change`, and the worktree's archive folder holds `.run/regressed/change.1.md` and no `.run/regressed/change.md`. Its `.run/events/change.jsonl` ends with a `retry` event whose target is `change`, the branch tip of `osq/<folder>` has the message `osq: <id> land retry`, and the worktree's status is empty. The next `osq land <id>` exits 0

#### Scenario: Retrying a task of an archived change
- **WHEN** the same stopped land holds `.run/regressed/change.md`, and a human runs `osq retry <id> 1` in the checkout
- **THEN** retry exits non-zero with `<folder> has archived; osq retry clears only its land stop: osq retry <id> change`, and the branch tip and the archive folder's files are unchanged

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

#### Scenario: Plan a finished change
- **WHEN** a human runs `osq plan 1` in the checkout, with the row's state for change `001-order-flow` and no active change folder
- **THEN** the command fails with the row's message, the changes directory holds the same folders as before, and no file changes in the checkout:

| State | Message |
|---|---|
| landed: the default branch holds `openspec/changes/archive/001-order-flow`, and its worktree is gone | `001-order-flow has landed, so osq plan 1 has nothing to reopen. Start new work with an item in openspec/queue.md and osq plan --next, or with osq plan <name> --brief <file>.` |
| archived in the checkout with `vcs.enabled` off | `001-order-flow has archived, so osq plan 1 has nothing to reopen. Start new work with an item in openspec/queue.md and osq plan --next, or with osq plan <name> --brief <file>.` |
