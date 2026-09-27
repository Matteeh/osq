## ADDED Requirements

### Requirement: Dispatch items
<!-- source: src/core/status/dispatch-items.ts, src/core/status/dispatch-land.ts, tests/dispatch-items.test.ts -->
`readDispatchItems(projectRoot, config)` SHALL derive, on every call and
without writing anything, the items that need a human, and a
`watcherIdle` flag. It SHALL read active changes, their next steps, and
pending verifications from `getStatusOverview`. Each item SHALL carry its
kind, the change's id, folder name, title, and folder path, the task number
and title when there is one, and the commands osq already has for it. The
items SHALL be in numeric change order, then task order. The kinds are:

- `approval`: an active change whose next step is `ready-for-approval`,
  with commands `osq approve <id>` and `osq show <id>`.
- `halt`: one per dead or regressed task, with commands
  `osq retry <id> <n>` and `osq show <id>`; and one per change-level
  regression, with commands `osq retry <id> change`,
  `osq reject <id> --reason <text>`, and `osq show <id>`.
- `land`: with `vcs.enabled` and `GitVcs`, one per change archived in an
  osq worktree whose `readDependencyState` is `archived`, with commands
  `git merge --squash osq/<folder> && osq message <id> | git commit -F -`
  and `osq show <id>`. With `vcs.enabled` off and `GitVcs`, one per folder
  in the project root's archive directory that `Vcs` status lists as
  untracked or modified, itself or any path under it, with command
  `osq show <id>`. Under `NoVcs` there SHALL be no land items.
- `verify`: one per pending verification, with its next step's command and
  `osq show <id>`.

`watcherIdle` SHALL be true when no active change's next step is `running`.

#### Scenario: Each kind
- **WHEN** a project has an unapproved change ready for approval, an approved change with a dead task, and an archived change whose verification is pending
- **THEN** the items are an `approval`, a `halt` for that task, and a `verify`, each with its commands

#### Scenario: Unplanned draft
- **WHEN** an unapproved change still has the planning sentinel verify
- **THEN** it yields no item

#### Scenario: Items follow state
- **WHEN** the dead task's marker is removed and the approval is written
- **THEN** the next call has neither the halt nor the approval item

#### Scenario: Change regression
- **WHEN** an approved change has `.run/regressed/change.md`
- **THEN** there is one `halt` item with no task and the `osq retry <id> change` command

#### Scenario: Uncommitted archive with the flag off
- **WHEN** `vcs.enabled` is off, the project is a git repository, and an archived folder is untracked
- **THEN** there is one `land` item for it, and none once the folder is committed

#### Scenario: Archived on its branch
- **WHEN** `vcs.enabled` is on and a change has archived in its worktree and not landed
- **THEN** there is one `land` item for it, and none after `git merge --squash` and a commit put its archive on the default branch

#### Scenario: No git
- **WHEN** the project is not a git repository
- **THEN** there are no `land` items

#### Scenario: Watcher idle
- **WHEN** no approved change has work left, and then an approved change has a pending task
- **THEN** `watcherIdle` is true first and false second

### Requirement: Dispatch order
<!-- source: src/core/status/dispatch-order.ts, tests/dispatch-order.test.ts -->
`orderDispatchItems(projectRoot, config, dispatch)` SHALL return the items
with a `weight` and a `reason` each, in dispatch order. An item's weight
SHALL be one plus the number of active changes, in any tree, whose
`depends_on` reaches the item's change directly or through other active
changes. Ids SHALL match folders as `matchesFolder` does, and a cycle
SHALL count each change once. The order SHALL be:

1. When `watcherIdle` is true, `approval` and `halt` items first.
2. Then higher weight first.
3. Then lower change id, then lower task number, with a change-level item
   before its task items.

The reason SHALL join, with `; `, `watcher idle; this gives it work` when
rule 1 applies to the item and
`holds up <weight - 1> change` or `holds up <weight - 1> changes` when the
weight is above one. When neither applies, it SHALL be `in change order`.
The same files SHALL always give the same order.

#### Scenario: Weight orders
- **WHEN** an approval item's change has three active changes depending on it, one of them through another, and another approval item's change has none
- **THEN** the first item has weight 4 and reason `holds up 3 changes` and comes first

#### Scenario: Idle watcher
- **WHEN** `watcherIdle` is true and there is a heavy `verify` item and a light `halt` item
- **THEN** the `halt` item comes first with reason `watcher idle; this gives it work`

#### Scenario: Equal items
- **WHEN** two items have the same kind group and weight
- **THEN** the lower change id comes first with reason `in change order`

#### Scenario: Dependency cycle
- **WHEN** two active changes depend on each other
- **THEN** each has weight 2

### Requirement: Dispatch cards
<!-- source: src/core/status/dispatch-cards.ts, src/core/run/squash-message.ts, src/core/foundation/config.ts, tests/dispatch-cards.test.ts -->
`readDispatchCard(projectRoot, config, item)` SHALL return the card data
for one item:

- `approval`: the approval digest from `buildApprovalDigest`.
- `halt`: for a task, the task number and title, the dead or regressed
  reason, the number of `started` events in `.run/events/<n>.jsonl` as the
  attempt count, the last `limits.cardOutputLines` lines of the marker body,
  and the path of `.run/dead/<n>.patch` relative to the project root
  when that file exists. For a change-level regression, the reason and
  the last `limits.cardOutputLines` lines of `.run/regressed/change.md`'s
  body.
- `land`: the proposal's goal, one outcome line per task as
  `osq message` writes it, and, with `vcs.enabled`, the message
  `buildSquashMessage` builds, or its refusal message when it refuses.
- `verify`: the check command when the change has one, the after-landing
  steps from the proposal, and the verification outcome so far.

The marker lines come from files osq already writes with paths relative
to the project root, and the card SHALL NOT add an absolute path.

#### Scenario: Approval card
- **WHEN** the card is read for an approval item
- **THEN** it holds the digest's goal, capabilities, decisions, and tasks with their scopes

#### Scenario: Halt card
- **WHEN** a task died with `verify_red` after two attempts and its marker body holds verify output
- **THEN** the card has attempt count 2, reason `verify_red`, the last lines of that output, and no string that contains the project root

#### Scenario: Halt card with a patch
- **WHEN** the dead task's change left `.run/dead/<n>.patch`
- **THEN** the card names that patch by its relative path

#### Scenario: Land card
- **WHEN** a change archived in its worktree with `vcs.enabled`
- **THEN** the card holds the goal, one outcome line per task, and the squash message with `Osq-Change` among its trailers

#### Scenario: Verify card
- **WHEN** an archived change has a `check` command and after-landing steps
- **THEN** the card holds the check command and the steps
