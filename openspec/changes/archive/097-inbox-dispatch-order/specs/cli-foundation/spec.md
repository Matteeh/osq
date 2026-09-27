## ADDED Requirements

### Requirement: Inbox dispatch command
<!-- source: src/cli/inbox-dispatch.ts, src/cli/index.ts, src/core/status/dispatch.ts, src/core/status/dispatch-text.ts, tests/inbox-dispatch.test.ts -->
`osq inbox` SHALL read the dispatch items, order them, and read the first
item's card, writing nothing. It SHALL print `Needs you (<n>):`, then one line
per item in order,
`  <position>. <kind> <id> <title>[ task <n>: <task title>] (<reason>)`,
then a blank line and the first item's card. The card SHALL start with
`<kind>: <folder>`, then `  why: <reason>`, then the card data for its kind,
then `Actions:` with one `  <command>` line per command. An empty inbox SHALL
print `Nothing needs you.` With `--json`, it SHALL print
`{ "watcherIdle": <bool>, "items": [...] }`, where each item holds its
kind, change, task, weight, reason, commands, and card. It SHALL exit zero.
Bare `osq` and `osq --json` SHALL be unchanged. `limits.cardOutputLines`
SHALL default to 20.

#### Scenario: Ordered list and first card
- **WHEN** a project has a halt item and an approval item whose change two others depend on, and the watcher has no runnable change
- **THEN** `osq inbox` lists the approval first, then the halt, and prints the approval's card with its goal and `osq approve <id>` under `Actions:`

#### Scenario: JSON
- **WHEN** `osq inbox --json` runs on the same project
- **THEN** the output parses as JSON with `watcherIdle` true and two items that each carry a card

#### Scenario: Empty
- **WHEN** nothing needs a human
- **THEN** `osq inbox` prints `Nothing needs you.`

#### Scenario: Registered
- **WHEN** `createProgram` builds the CLI
- **THEN** it has an `inbox` command with a `--json` option, and bare `osq` still runs the attention inbox
