# Spec Delta: Status Inspection

## ADDED Requirements

### Requirement: Blocked inbox items
<!-- source: src/core/status/blocked-item.ts, src/core/status/inbox-projection.ts, src/core/status/inbox.ts, src/core/status/inbox-text.ts, tests/inbox-blocked.test.ts -->
A `task-dead` inbox item whose task died with reason `blocked` SHALL carry
`blocked: { need }`, where `need` is the task result file's `## Blocked` text as
`parseResultSections` reads it. When the result file has no such section, `need`
SHALL be `(not stated)`. The item's command SHALL be
`osq reject <id> --reason <text>`. Its text row SHALL be
`<task row> — blocked: <need> — reject, then osq plan --next --replan — osq reject <id> --reason <text>`,
with whitespace in the need, line breaks included, collapsed to single spaces.
Every other `task-dead` item SHALL stay exactly as before.

#### Scenario: Blocked task in the inbox
- **WHEN** task 1 of change 001 died with `blocked` and its result file's `## Blocked` says `Needs src/b.ts in scope`
- **THEN** `osq --json` gives its `task-dead` item `blocked: { need: "Needs src/b.ts in scope" }` and the command `osq reject 001 --reason <text>`, and the text row shows the need and `osq plan --next --replan`

#### Scenario: Other dead task
- **WHEN** a task died with `verify_red`
- **THEN** its item has no `blocked` key and its command is `osq retry <id> <n>`

## MODIFIED Requirements

### Requirement: Action command contract
<!-- source: src/core/inbox.ts, src/core/status/blocked-item.ts, tests/inbox.test.ts, tests/inbox-blocked.test.ts -->
Every inbox item SHALL expose one exact `command`. Approval items SHALL use
`osq approve <id>`; dead and regressed tasks SHALL use
`osq retry <id> <n>`, except a task that died with `blocked`, which SHALL use
`osq reject <id> --reason <text>`; change-level regressions SHALL use
`osq reject <id> --reason <text>`; and running and landed items SHALL use
`osq show <id>`. Each rendered text row SHALL end with the same command.

#### Scenario: Actionable item projection
- **WHEN** any attention, running, or landed item is projected
- **THEN** its JSON command and trailing text command are identical and match its item kind

#### Scenario: Blocked task command
- **WHEN** a dead task's reason is `blocked`
- **THEN** its JSON command and trailing text command are both `osq reject <id> --reason <text>`
