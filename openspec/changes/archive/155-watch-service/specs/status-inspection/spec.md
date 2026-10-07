## ADDED Requirements

### Requirement: Watcher line
`formatWatcherLine` in `src/core/status/watcher-line.ts` SHALL render the
watch state that `readWatchState` returns as one line:

| Live `service.json` | Live `watcher.json` | Line |
|---|---|---|
| yes | yes | `Watcher: running in the background, osq v<version> (<commit>), pid <service pid>` |
| yes | no | `Watcher: restarting in the background, pid <service pid>` |
| no | yes | `Watcher: running in a terminal, osq v<version> (<commit>), pid <watcher pid>` |
| no | no | `Watcher: not running — osq watch --background` |

When the live `watcher.json` has a `waiting` reason, the line SHALL end with
`, waiting: <reason>`. Text output of `osq` SHALL print the inbox text, then
this line. `osq status` SHALL print its overview, an empty line, this line,
and then `Log: <log path>` when `watch.log` exists. `osq --json` SHALL print
the inbox object unchanged, without the line. Neither command SHALL write a
watch record.

#### Scenario: Background service with its build
- **WHEN** `service.json` names live pid 4100 and `watcher.json` names a live pid with version `0.2.4`, commit `f532410` and `waiting` null
- **THEN** the line is `Watcher: running in the background, osq v0.2.4 (f532410), pid 4100`

#### Scenario: Waiting for a build
- **WHEN** the live `watcher.json` has `waiting` set to `a new osq build is being written`
- **THEN** the line ends with `, waiting: a new osq build is being written`

#### Scenario: Nothing running
- **WHEN** neither record is live
- **THEN** `osq` ends its text with `Watcher: not running — osq watch --background`, and `osq --json` prints an object whose only keys are `needsYou`, `running` and `landed`

#### Scenario: Status shows the log
- **WHEN** `osq status` runs with a live service and an existing `watch.log`
- **THEN** its last two lines are the watcher line and `Log: <absolute path of watch.log>`

## MODIFIED Requirements

### Requirement: Concise inbox text
`formatInboxText` SHALL render `Needs you`, `Running`, and `Landed since last
look` in that order. Each empty group SHALL contain exactly one `(none)` line
when any group is non-empty. When every group is empty, its output SHALL be
exactly `Inbox empty.`. Running elapsed time SHALL use the existing duration
formatter, and every non-empty item row SHALL end with its exact action
command. `osq` prints the watcher line after this text, as "Watcher line"
says.

#### Scenario: Partially empty inbox
- **WHEN** at least one group contains an item and another group is empty
- **THEN** all headings render and each empty group has one `(none)` line

#### Scenario: Entirely empty inbox
- **WHEN** no group contains an item
- **THEN** `formatInboxText` returns the single line `Inbox empty.`
