## MODIFIED Requirements

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
SHALL default to 20. When stdin and stdout are both terminals and neither
`--json` nor `--follow` is given, `osq inbox` SHALL run the card session
instead of printing, as "Inbox cards on a terminal" says.

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

## ADDED Requirements

### Requirement: Inbox cards on a terminal
<!-- source: src/cli/inbox-terminal.ts, src/cli/inbox-dispatch.ts, README.md, tests/inbox-cards.test.ts -->
`inboxDispatchCommand` SHALL take `isTerminal`, `input`, and `launch`
options, defaulting to both stdio streams being TTYs, the terminal input,
and the child launcher from `src/cli/inbox-terminal.ts`. When `isTerminal()`
is true and neither `json` nor `follow` is set, it SHALL run
`runCardSession` with the inbox sound built by `createInboxSound`.

`createTerminalInput(stream)` SHALL read one key at a time with raw mode on
while a key is awaited and off otherwise, and `line(question)` SHALL write
the question and read one line with raw mode off. A stream without
`setRawMode` SHALL still work.

`createChildLauncher(projectRoot)` SHALL spawn `process.execPath` with osq's
own `bin` entry beside `inbox-terminal`'s module (`bin.ts` with
`--import` and the absolute URL `import.meta.resolve('tsx')` gives, when
that module is `.ts`; `bin.js` otherwise) and the
key's arguments, with `cwd` the project root and stdio inherited, never
through a shell. It SHALL resolve with the exit code, 1 when the child
ends by a signal or fails to start. While the child runs, SIGINT SHALL not
end osq.

README.md SHALL say, in the Human Attention Inbox section, that
`osq inbox` on a terminal opens cards, list the keys, say that a key runs
the osq command as a child process on the same terminal, that the land
command is shown to copy, and that piping or `--json` prints as before.

#### Scenario: Terminal runs the session
- **WHEN** `inboxDispatchCommand` runs with `isTerminal` true, scripted keys `q`, and a project with one approval item
- **THEN** the approval card with its `Keys:` block prints and the command resolves without launching

#### Scenario: No terminal prints
- **WHEN** `inboxDispatchCommand` runs with `isTerminal` false
- **THEN** it prints what `osq inbox` printed before

#### Scenario: Raw mode around a key
- **WHEN** `createTerminalInput` reads a key from a fake stream with `setRawMode`
- **THEN** raw mode is turned on before the read and off after it

#### Scenario: Real child
- **WHEN** `createChildLauncher` launches `--version`
- **THEN** it resolves with 0
