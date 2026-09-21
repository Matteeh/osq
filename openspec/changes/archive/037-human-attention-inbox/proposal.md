---
title: Human attention inbox
depends_on: ["036"]
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - status-inspection
    - watcher-and-harness
---
## Goal

Make bare `osq` the human attention inbox: show what needs intervention, what
is currently running, and what landed since the previous look, with the same
stable data contract available through `osq --json`.

## Verify

`pnpm verify`

The suite includes a local fixture containing an unapproved change, a dead
task, a live running lock, a change-level regression, and a recent archived
change. It invokes the real CLI in text and JSON modes, verifies cursor
advancement and reset behavior, and requires no network, authentication, model,
or TTY.

## Non-goals

- Changing or replacing `osq status`.
- A TUI, interactive prompts, watching, or HTTP.
- Writing into an active, archived, or rejected change folder.
- Reaping stale locks or performing approval, retry, rejection, or show actions.
- Adding a cross-project index or database.
- Colour or terminal-width-specific rendering.

## Contract

### Requirement: Bare command attention inbox

`osq` with no subcommand SHALL derive one inbox containing `needsYou`,
`running`, and `landed`. It SHALL reuse the status and state derivation boundary
for active changes rather than independently rereading active marker files.

`needsYou` SHALL contain:

- each active change with `proposal.md` and no approval marker;
- each task derived as dead or regressed; and
- each change with an active change-level regression.

`running` SHALL contain only tasks whose derived state is running and whose
lock contains a currently live PID. Each item SHALL expose its lock start time
and non-negative elapsed seconds.

`landed` SHALL contain archived changes selected by the last-look rules below,
using the typed change-level `archived` event as the authoritative archive
timestamp.

All groups SHALL be deterministic. Attention and running items SHALL sort by
numeric change and task order. Landed items SHALL sort newest first.

#### Scenario: Mixed project state
- **WHEN** bare `osq` runs with unapproved, failed, regressed, running, and recently archived changes
- **THEN** each qualifying item appears once in its corresponding deterministic group

#### Scenario: Stale running marker
- **WHEN** a task has a running marker whose PID is not live
- **THEN** the task is absent from the running group and the inbox does not mutate or reap its marker

### Requirement: Exact next-action commands

Every non-empty text row and every JSON item SHALL carry the command associated
with that item:

- approval: `osq approve <id>`;
- dead or regressed task: `osq retry <id> <n>`;
- change-level regression: `osq reject <id> --reason <text>`;
- running task: `osq show <id>`;
- landed change: `osq show <id>`.

Text rows SHALL end with the command exactly as exposed by their JSON item.

#### Scenario: Actionable inbox rows
- **WHEN** an inbox group contains entries
- **THEN** every rendered row ends with the command represented by that entry's `command` field

### Requirement: Stable inbox JSON contract

`osq --json` SHALL print only one JSON object with exactly the top-level keys
`needsYou`, `running`, and `landed`. It SHALL represent the same snapshot used
by text output with this stable shape:

```json
{
  "needsYou": [
    {
      "kind": "approval | task-dead | task-regressed | change-regressed",
      "change": {
        "id": "string",
        "title": "string"
      },
      "task": null,
      "command": "string"
    }
  ],
  "running": [
    {
      "change": {
        "id": "string",
        "title": "string"
      },
      "task": {
        "number": "string",
        "title": "string"
      },
      "pid": 123,
      "startedAt": "ISO-8601 string",
      "elapsedSeconds": 12,
      "command": "string"
    }
  ],
  "landed": [
    {
      "change": {
        "id": "string",
        "title": "string"
      },
      "archivedAt": "ISO-8601 string",
      "command": "string"
    }
  ]
}
```

For `task-dead` and `task-regressed`, `task` SHALL contain `number` and
`title`; for approval and change-level regression it SHALL be null. Empty
groups SHALL be empty arrays. JSON mode SHALL emit no headings, help text, or
other prose.

#### Scenario: Text and JSON parity
- **WHEN** text mode and JSON mode run against the same filesystem snapshot and clock
- **THEN** they contain the same ordered entries, commands, archive timestamps, and running elapsed values

### Requirement: Per-project last-look cursor

Each bare invocation, including `osq --json`, SHALL read and then advance a
per-project cursor at
`~/.osq/last-look/<sha256(realpath(project-root))>.json`. The file SHALL contain
the invocation timestamp as an ISO-8601 `lastLook` value and SHALL be written
without modifying any change folder.

With a valid cursor, `landed` SHALL contain archives whose authoritative
`archived` event is later than the stored timestamp. With a missing, deleted,
or malformed cursor, it SHALL contain the newest ten archives having valid
archive events. Cursor state SHALL remain derived and safely deletable.

#### Scenario: Subsequent look
- **WHEN** a valid cursor exists and changes have archived after its timestamp
- **THEN** only those later archives appear and the cursor advances for the next invocation

#### Scenario: Cursor reset
- **WHEN** the project cursor is missing, deleted, or malformed
- **THEN** the newest ten recorded archives appear and the invocation writes a fresh valid cursor

### Requirement: Concise text rendering

Text mode SHALL render the groups `Needs you`, `Running`, and
`Landed since last look` in that order. A group with no entries SHALL render
one `(none)` line. When all three groups are empty, output SHALL collapse to the
single line `Inbox empty.`

Running rows SHALL render elapsed time using the existing duration formatter.
Bare invocation SHALL not print Commander help.

#### Scenario: Partially empty inbox
- **WHEN** at least one group has entries and another is empty
- **THEN** all three headings render and each empty group contains exactly one `(none)` line

#### Scenario: Completely empty inbox
- **WHEN** all three arrays are empty
- **THEN** text output is exactly `Inbox empty.`

### Requirement: Full status remains unchanged

The existing `osq status` command SHALL retain its full active task table,
archive count, rejected-change projection, formatting, and command behavior.

#### Scenario: Explicit status invocation
- **WHEN** a user runs `osq status`
- **THEN** the existing status output is returned without inbox filtering or last-look mutation

## Human steps

- Finish and archive dependency 036 before approving or executing this change.
- After reviewing the completed task body and deltas, run `pnpm osq approve 037` yourself. Neither planner nor executor approves the change.

## Delta

- `specs/cli-foundation/spec.md`: bare-command dispatch, root `--json`, and preservation of explicit subcommands.
- `specs/status-inspection/spec.md`: inbox derivation, stable JSON shape, actionable text rendering, live-lock projection, last-look cursor, and inbox code ownership.
