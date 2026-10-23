## ADDED Requirements

### Requirement: Archived change with a failed archive commit
An archived change in an osq worktree whose `.run/regressed/change.md`
has reason `commit_failed` SHALL have, when it needs no steering, the next
step `{ state: 'dead', command: 'osq retry <id> change', detail: 'archive
commit failed' }`, so `osq show` and `osq status` print it and it is not
among the changes waiting to land. `readInbox` SHALL add, after the
archived steering items, one `change-regressed` needs-you item with no
task and the command `osq retry <id> change` for each such change, in
numeric order, so its text row is
`  <id>: <title> — change regressed — osq retry <id> change`.
`readDispatchItems` SHALL give such a change one `halt` item with no task
and the commands `osq retry <id> change` and `osq show <id>`, and no
`land` item.

#### Scenario: Failed archive commit in show and the inbox
- **WHEN** change 002, titled `Orders`, archived in its worktree, and its archived folder's `.run/regressed/change.md` has reason `commit_failed`
- **THEN** its next step formats as `dead (archive commit failed) — osq retry 002 change`, `osq --json` holds one needs-you `change-regressed` item for it with command `osq retry 002 change` and no `change-archived` item, its inbox text row is `  002: Orders — change regressed — osq retry 002 change`, and `readDispatchItems` holds one `halt` item for 002 with the commands `osq retry 002 change` and `osq show 002` and no `land` item

#### Scenario: Other archived halts unchanged
- **WHEN** change 002 archived in its worktree with a recorded `sync_conflict` stop
- **THEN** its next step command is still `osq plan 002` and its inbox row is still the steering row

## MODIFIED Requirements

### Requirement: Next step detail and format
`detail` SHALL be `do the steps before approval first` for a
`ready-for-approval` change with steps before approval, `waiting for <ids>` for
`blocked`, `needs steering` for a `dead` change whose derived state has
`steering`, `archive commit failed` for a `dead` archived change
whose archive commit failed, `not landed` for `archived`, `paused until <time>` for a `running`
change whose `readActivePause` returns a pause, with `<time>` from
`formatPauseUntil`, and null otherwise. `formatNextStep`
SHALL render the state with spaces for hyphens, then ` (<detail>)` when set,
then ` — <command>` when set.

#### Scenario: Failed verification
- **WHEN** an archived change's latest `verification_recorded` outcome is `failed`
- **THEN** `formatNextStep` renders `landed`

#### Scenario: Steering format
- **WHEN** change 007 needs steering
- **THEN** `formatNextStep` renders `dead (needs steering) — osq plan 007`

#### Scenario: Not landed format
- **WHEN** change 007 is archived and the default branch does not hold it
- **THEN** `formatNextStep` renders `archived (not landed) — osq land 007`, and `osq show 007` prints `Next: archived (not landed) — osq land 007`

#### Scenario: Paused format
- **WHEN** approved change 007 has a pending task and its `.run/paused.md` holds task `1` until `2099-01-01T09:30:00.000Z`
- **THEN** `formatNextStep` renders `running (paused until 2099-01-01 09:30 UTC) — osq show 007`, `osq show 007` prints `Next: running (paused until 2099-01-01 09:30 UTC) — osq show 007`, and `osq status` prints `  next: running (paused until 2099-01-01 09:30 UTC) — osq show 007` under the change

#### Scenario: Passed pause format
- **WHEN** the same change's `.run/paused.md` holds until `2000-01-01T00:00:00.000Z`
- **THEN** `formatNextStep` renders `running — osq show 007`

### Requirement: Change next step
`readNextStep(projectRoot, folderPath, config)` SHALL return `{ state,
command, detail }` for an active or archived change. Unapproved, it SHALL be
`unplanned` when its verify is missing or the placeholder, else
`ready-for-approval`. Approved, it SHALL be `dead` for a dead or regressed task
or change, `blocked` for unmet dependencies, else `running`. Archived, it SHALL
be `dead` when its derived state has `steering`, else `dead` when its
`.run/regressed/change.md` has reason `commit_failed`, as "Archived change
with a failed archive commit" says, else as "Landed next step reads the
default branch" says.

#### Scenario: Fresh template
- **WHEN** a change created by `osq plan` still has the placeholder verify
- **THEN** its next step is `unplanned` with command `osq plan <id>`

#### Scenario: Plain archived change
- **WHEN** an archived change's `archived` event carries `verification: { afterLanding: true, check: null }` and no `verification_recorded` event follows
- **THEN** its next step is `landed` with a null command

#### Scenario: Archived change that needs steering
- **WHEN** change 007 archived in its worktree and `osq land 007` recorded a `sync_conflict` stop on its branch
- **THEN** its next step is `dead` with command `osq plan 007` and detail `needs steering`
