## MODIFIED Requirements

### Requirement: Action command contract
Every inbox item SHALL expose one exact `command`. Approval items SHALL use
`osq approve <id>`; dead and regressed tasks SHALL use
`osq retry <id> <n>`, except a task that died with `blocked`, which SHALL use
`osq reject <id> --reason <text>`; change-level regressions SHALL use
`osq retry <id> change`; and running and landed items SHALL use
`osq show <id>`. Each rendered text row SHALL end with the same command.

#### Scenario: Actionable item projection
- **WHEN** any attention, running, or landed item is projected
- **THEN** its JSON command and trailing text command are identical and match its item kind

#### Scenario: Blocked task command
- **WHEN** a dead task's reason is `blocked`
- **THEN** its JSON command and trailing text command are both `osq reject <id> --reason <text>`

#### Scenario: Change-level halt command
- **WHEN** change 004 has `.run/regressed/change.md` with reason `worktree_dirty` and no dead or regressed task
- **THEN** its `change-regressed` item's JSON command and trailing text command are both `osq retry 004 change`

### Requirement: Next step commands
The command SHALL be `osq plan <id>` for `unplanned` with `brief.md`, else
`osq lint <id>`; `osq approve <id>`; `osq show <id>` for `running`;
`osq retry <id> <n>` for the first dead or regressed task, else
`osq retry <id> change`; `osq show <dep>` for the first unmet
dependency; `osq check <id>` while a check has not run since archive, else
`osq verified <id> --passed|--failed`; and null for `landed`.

#### Scenario: Blocked change
- **WHEN** an approved change depends on 012, which is not landed
- **THEN** its next step is `blocked` with command `osq show 012` and detail `waiting for 012`

#### Scenario: Change regression next step
- **WHEN** approved change 007 has `.run/regressed/change.md` and no dead or regressed task
- **THEN** its next step is `dead` with command `osq retry 007 change`
