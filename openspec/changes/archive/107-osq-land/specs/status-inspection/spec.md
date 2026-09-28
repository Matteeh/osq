## MODIFIED Requirements

### Requirement: Dispatch items
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
  `osq land <id>` and `osq show <id>`. With `vcs.enabled` off and `GitVcs`,
  one per folder in the project root's archive directory that `Vcs` status
  lists as untracked or modified, itself or any path under it, with command
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
- **THEN** there is one `land` item for it with the command `osq land <id>`, and none after `git merge --squash` and a commit put its archive on the default branch

#### Scenario: No git
- **WHEN** the project is not a git repository
- **THEN** there are no `land` items

#### Scenario: Watcher idle
- **WHEN** no approved change has work left, and then an approved change has a pending task
- **THEN** `watcherIdle` is true first and false second

### Requirement: Card keys
`cardKeys(item)` SHALL map each of the item's commands to keys, in the
item's command order:

- `osq approve <id>`: `a`.
- `osq retry <id> <target>`: `r`.
- `osq reject <id> --reason <text>`: `x`, which asks `Reason: `; its
  arguments are `reject <id> --reason` and the answer.
- `osq check <id>`: `c`.
- `osq verified <id> --passed|--failed`: `p` with `verified <id> --passed`
  and `f` with `verified <id> --failed`.
- `osq show <id>`: `s`.

Each key SHALL carry its label (the command with the chosen flag, or with
`--reason <text>` for reject) and its argument list without the leading
`osq`. A command that does not start with `osq `, or whose verb is not in
this list, SHALL be returned among `manual` commands, unchanged.

`formatCardScreen(total, item, card, keys)` SHALL return `Needs you (<total>):`,
then the card as `osq inbox` prints it up to but not including `Actions:`,
then `Keys:` with one `  <key>  <label>` line per key followed by
`  n  skip` and `  q  quit`, then, when there are manual commands,
`Run yourself:` with one `  <command>` line each. `dispatch-text.ts` SHALL
export `formatDispatchCardBody(item, card)`, the card lines before
`Actions:`, and `osq inbox` SHALL print what it printed before.

#### Scenario: Approval keys
- **WHEN** `cardKeys` runs on an approval item
- **THEN** it returns `a` with arguments `approve <id>` and `s` with `show <id>`, and no manual commands

#### Scenario: Change halt keys
- **WHEN** `cardKeys` runs on a change-level halt item
- **THEN** it returns `r`, `x` asking `Reason: `, and `s`

#### Scenario: Verify keys
- **WHEN** `cardKeys` runs on a verify item without a check command
- **THEN** it returns `p` with `verified <id> --passed`, `f` with `verified <id> --failed`, and `s`

#### Scenario: Land in a worktree
- **WHEN** `cardKeys` runs on a land item archived in a worktree
- **THEN** `osq land <id>` is a manual command and `s` is the only key

#### Scenario: Screen
- **WHEN** `formatCardScreen` formats an approval item's card
- **THEN** it holds `Needs you (<n>):`, the card body without `Actions:`, and `Keys:` with `a`, `s`, `n`, and `q` lines
