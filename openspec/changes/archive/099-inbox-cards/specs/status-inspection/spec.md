## ADDED Requirements

### Requirement: Dispatch watch
<!-- source: src/core/status/dispatch-watch.ts, src/core/status/dispatch-follow.ts, tests/dispatch-watch.test.ts -->
`watchDispatch(projectRoot, config, options, onItems)` SHALL derive the
ordered dispatch items with `readDispatchItems` and `orderDispatchItems`
after each `createInvalidationHub` batch and every `inbox.pollSeconds`
through `options.every`, one derivation at a time, with a batch or poll
during one causing one more after it. After each derivation it SHALL call
`onItems(items, at)` with the items and the clock time the derivation
started, then read the trees again through `options.trees`, and when their
`treeWatchPaths` differ from the watched paths, close the hub, open a new
one, and derive once more. A derivation that throws SHALL call
`options.stderr` with `osq inbox: <message>` and keep watching. It SHALL
take the same `watch`, `schedule`, `every`, `trees`, `now`, and `stderr`
seams as `followDispatch`, and return `{ close(): Promise<void> }`, which
closes the hub and cancels the poll. It SHALL derive once as soon as it
starts. `followDispatch` SHALL be built on it and print what it printed
before.

#### Scenario: Batch derives
- **WHEN** the fake watcher fires after a task dies
- **THEN** `onItems` receives items that include the new halt item

#### Scenario: Poll derives
- **WHEN** the manual poll timer fires with no watcher event
- **THEN** `onItems` is called again

#### Scenario: Close
- **WHEN** `close()` resolves
- **THEN** the fake watcher is closed, the poll is cancelled, and `onItems` is not called again

#### Scenario: Follow unchanged
- **WHEN** `tests/inbox-follow.test.ts` runs
- **THEN** every test passes unchanged

### Requirement: Card keys
<!-- source: src/core/status/dispatch-keys.ts, src/core/status/dispatch-text.ts, tests/dispatch-keys.test.ts -->
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
- **THEN** the `git merge --squash ...` command is a manual command and `s` is the only key

#### Scenario: Screen
- **WHEN** `formatCardScreen` formats an approval item's card
- **THEN** it holds `Needs you (<n>):`, the card body without `Actions:`, and `Keys:` with `a`, `s`, `n`, and `q` lines

### Requirement: Card session
<!-- source: src/core/status/dispatch-session.ts, tests/dispatch-session.test.ts -->
`runCardSession(projectRoot, config, options)` SHALL run until the reviewer
quits. `options` SHALL hold `input` (`key(): Promise<string | null>` and
`line(question): Promise<string | null>`), `launch(args): Promise<number>`,
`sound`, `stdout`, `stderr`, `now`, `signal`, and the watch seams of
`watchDispatch`. The session SHALL keep at most one pending `key()` read.

- It SHALL derive the ordered items, put the items skipped in this session
  after the rest in the order they were skipped, and print
  `formatCardScreen` for the first item with its card from
  `readDispatchCard`.
- A key from `cardKeys` SHALL print `── <label> ──`, await `launch` with its
  arguments, print `── exit <code> ──`, and derive again. The reject key
  SHALL first ask `Reason: ` through `input.line`; an empty or null answer
  SHALL show the same card without launching.
- After a launch, when the item's kind, change folder, and task number are
  gone, the next first item's card SHALL show; when it is still there, its
  card SHALL show again, read afresh.
- `n` SHALL move the item behind the others for the rest of the session and
  show the next card. A skipped item that goes away SHALL leave the list.
- `q`, `\u0003`, a null key, or `signal` aborting SHALL end the session.
  Any other key SHALL be ignored.
- With no items, it SHALL print
  `Nothing needs you. Waiting for new items (q to quit).`, watch with
  `watchDispatch`, and on the first derivation with items close the watch,
  call `sound.notify(at)` once, and show the first card. `q` while waiting
  SHALL end the session.
- It SHALL never call `sound.notify` while a card is shown. It SHALL write
  nothing itself; only launched commands write.

#### Scenario: Approve and move on
- **WHEN** the inbox holds an approval item and a halt item, the key `a` is pressed, and the recording launcher approves the change
- **THEN** the launcher got `approve <id>`, the separators print around it, and the halt item's card shows next

#### Scenario: Item still there
- **WHEN** the launcher returns 1 and changes nothing
- **THEN** `── exit 1 ──` prints and the same card shows again

#### Scenario: Reject asks for a reason
- **WHEN** `x` is pressed on a change-level halt and the reason is `wrong approach`
- **THEN** the launcher got `reject <id> --reason` and `wrong approach` as separate arguments

#### Scenario: Skip
- **WHEN** `n` is pressed on the first of two items
- **THEN** the second item's card shows, and after `n` again the first shows

#### Scenario: Empty then an item arrives
- **WHEN** the session starts with no items, then a task dies and the fake watcher fires
- **THEN** the waiting line prints, `notify` is called once, and the halt card shows

#### Scenario: No sound on an open card
- **WHEN** a card is shown and a new item appears before the next key
- **THEN** `notify` is never called and the new item takes its place in the order after the key

#### Scenario: Quit
- **WHEN** `q` is pressed on a card, or while waiting
- **THEN** the session resolves without launching anything
