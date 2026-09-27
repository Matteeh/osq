## ADDED Requirements

### Requirement: Inbox wait log
<!-- source: src/core/status/wait-log.ts, tests/wait-log.test.ts -->
`resolveWaitLogPath(projectRoot, home)` SHALL return
`<home>/.osq/inbox/<hash>.jsonl`, where `<hash>` is the SHA-256 hex of the
project root's real path, as `resolveLastLookPath` computes it. The log
SHALL hold one JSON object per line, each with `type`, `at` (an ISO
timestamp), and `session` (a string), and by type:

- `start`: `mode`, `cards` or `follow`.
- `seen`: `item`, `idle`, and `unobserved`.
- `opened`: `item` and `idle`.
- `gone`: `item`, `idle`, and `unobserved`.
- `top`: `item` or null, and `idle`.
- `stop`: nothing more.

`item` SHALL be `{ kind, change, task }`, with the change folder and the
task number, or null for a change-level item. `idle` SHALL be the dispatch's
`watcherIdle` when the record was written. `dispatchIdentity(item)` SHALL
join the kind, the change folder, and the task number (empty when there is
none) with `\u0000`, for dispatch items and log items alike.

`readWaitLog(projectRoot, home)` SHALL return the records in file order,
leaving out any line that does not parse as JSON or lacks a known `type`, a
string `at`, or a string `session`. It SHALL return null when the file does
not exist.

`waitEpisodes(records)` SHALL fold the records in order. A `seen` SHALL open
an episode for its identity when none is open. An `opened` SHALL set the open
episode's opened time and session when they are unset. A `gone` SHALL close
the open episode. Any other `seen`, `opened`, or `gone` SHALL be ignored.
Each episode SHALL carry its item; its seen time, session, `idle`, and
`unobserved`; its opened time and session, or null; and its gone time,
session, `idle`, and `unobserved`, or null while open.

`firstSeenTimes(records)` SHALL map the identity of every open episode to
its seen time.

#### Scenario: Path
- **WHEN** `resolveWaitLogPath` runs for a project root and for a symlink to it, with home `/h`
- **THEN** both return the same `/h/.osq/inbox/<64 hex characters>.jsonl`

#### Scenario: Episodes
- **WHEN** the records are a `seen` for halt 002 task 1, a second `seen` for it from another session, an `opened`, a `gone`, and then another `seen` for it
- **THEN** there are two episodes: the first closed, with its opened time, and the second open

#### Scenario: First seen
- **WHEN** the log holds an open episode for halt 002 task 1 and a closed one for approval 001
- **THEN** `firstSeenTimes` holds only the halt's identity, with its seen time

#### Scenario: Unreadable lines
- **WHEN** the log holds a line that is not JSON and a record without `type` between two good records
- **THEN** `readWaitLog` returns the two good records

#### Scenario: No log
- **WHEN** the project has no wait log under the home
- **THEN** `readWaitLog` returns null

### Requirement: Inbox wait recorder
<!-- source: src/core/status/wait-recorder.ts, tests/wait-recorder.test.ts -->
`createWaitRecorder(projectRoot, mode, options)` SHALL return
`{ observe(items, idle, at), opened(item, idle, at), stop(at) }`, where
`mode` is `cards` or `follow` and `options` holds `home` and `stderr`. Each
method SHALL resolve once its records are appended to
`resolveWaitLogPath(projectRoot, options.home)`, creating the directory when
it is missing, and appends SHALL happen in call order. Every record SHALL
carry the session id: the process id and the first `observe`'s time in
milliseconds, joined with `-`.

- The first `observe` SHALL append `start` with `mode`, then read the log
  and append a `gone` with `unobserved: true` for every open episode whose
  identity is not among `items`, and a `seen` with `unobserved: true` for
  every item with no open episode.
- A later `observe` SHALL append a `seen` with `unobserved: false` for every
  item that was not among the previous `observe`'s items, then a `gone` with
  `unobserved: false` for every previous item no longer among `items`.
- Every `observe` SHALL then append `top` with the first item, or null, and
  `idle`, when that pair differs from the last `top` this recorder appended.
- `opened` SHALL append `opened`. `stop` SHALL append `stop` when `start`
  was appended, and nothing otherwise.
- Every record an `observe` appends SHALL carry its `at` and `idle`.
- A failed append SHALL call `options.stderr` with
  `osq inbox: wait log: <message>` once per recorder, and no method SHALL
  reject.

#### Scenario: First observe
- **WHEN** the log holds an open episode for an item that is gone, and the first `observe` gets one new approval item
- **THEN** it appends `start`, a `gone` for the old item and a `seen` for the approval, both with `unobserved: true`, and a `top` naming the approval

#### Scenario: Later observe
- **WHEN** a second `observe` gets a halt item in place of the approval
- **THEN** it appends a `seen` for the halt and a `gone` for the approval, both with `unobserved: false`, and a `top` naming the halt

#### Scenario: Same top
- **WHEN** a third `observe` gets the same items and the same `idle`
- **THEN** it appends nothing

#### Scenario: Stop without start
- **WHEN** `stop` is called before any `observe`
- **THEN** no log file exists

#### Scenario: Unwritable home
- **WHEN** the home is a regular file and `observe` is called twice
- **THEN** both calls resolve and `stderr` got one `osq inbox: wait log: ` line

### Requirement: Wait recording
<!-- source: src/core/status/dispatch-session.ts, src/core/status/dispatch-follow.ts, src/core/status/dispatch-set-aside.ts, tests/wait-recording.test.ts -->
`runCardSession` and `followDispatch` SHALL take an optional `recorder`,
with the methods `createWaitRecorder` returns, and record nothing without
one.

- The card session SHALL call `recorder.observe(items, idle, at)` after
  every derivation, its own and the watch's, with the ordered items after
  the set-aside ones are moved behind, the dispatch's `watcherIdle`, and the
  time the derivation started from `options.now`. It SHALL call
  `recorder.opened(item, idle, at)` each time it prints a card, and
  `recorder.stop(at)` when it ends.
- `followDispatch` SHALL call `recorder.observe` with the items it prints
  at start and after every derivation, and `recorder.stop(at)` when
  `signal` aborts.

#### Scenario: Approve recorded
- **WHEN** a card session with a recorder under a temporary home starts on an approval item and a halt item, `a` approves the change, and `q` quits
- **THEN** the log holds, in order, `start`, a `seen` for each item, `top` for the approval, `opened` for the approval, `gone` for the approval, `top` for the halt, `opened` for the halt, and `stop`

#### Scenario: Follow recorded
- **WHEN** `followDispatch` with a recorder starts on an empty inbox, a task dies, the fake watcher fires, and the signal aborts
- **THEN** the log holds `start`, `top` with a null item, a `seen` for the halt with `unobserved: false`, `top` for the halt, and `stop`

#### Scenario: No recorder
- **WHEN** a card session runs without a recorder
- **THEN** nothing is written under the home

## MODIFIED Requirements

### Requirement: Dispatch order
<!-- source: src/core/status/dispatch-order.ts, src/core/status/dispatch.ts, tests/dispatch-order.test.ts, tests/dispatch-age.test.ts -->
`orderDispatchItems(projectRoot, config, dispatch, firstSeen)` SHALL return
the items with a `weight` and a `reason` each, in dispatch order.
`firstSeen` SHALL map `dispatchIdentity` values to dates and default to an
empty map. An item's weight SHALL be one plus the number of active changes,
in any tree, whose `depends_on` reaches the item's change directly or
through other active changes. Ids SHALL match folders as `matchesFolder`
does, and a cycle SHALL count each change once. The order SHALL be:

1. When `watcherIdle` is true, `approval` and `halt` items first.
2. Then higher weight first.
3. Then items with a first-seen time before items without one, and the
   earlier first-seen time first.
4. Then lower change id, then lower task number, with a change-level item
   before its task items.

The reason SHALL join, with `; `, `watcher idle; this gives it work` when
rule 1 applies to the item and
`holds up <weight - 1> change` or `holds up <weight - 1> changes` when the
weight is above one. When neither applies, it SHALL be
`waiting since <YYYY-MM-DD HH:MM>`, the item's first-seen time in local
time, when the item has one, and `in change order` otherwise.
The same files SHALL always give the same order.

`readDispatch(projectRoot, config, home)` and
`readDispatchQueue(projectRoot, config, home)` SHALL pass
`firstSeenTimes` of `readWaitLog(projectRoot, home)`, or an empty map when
there is no log, with `home` defaulting to `os.homedir()`.

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

#### Scenario: First seen breaks ties
- **WHEN** two approval items have the same weight, and the wait log under the home has the higher change id first seen earlier
- **THEN** `readDispatch` with that home lists the higher change id first with reason `waiting since <YYYY-MM-DD HH:MM>` for its first-seen time

#### Scenario: Logged before unlogged
- **WHEN** only the higher change id of two equal approval items has a first-seen time
- **THEN** it comes first, and the other item's reason is `in change order`

### Requirement: Dispatch watch
<!-- source: src/core/status/dispatch-watch.ts, src/core/status/dispatch-follow.ts, tests/dispatch-watch.test.ts, tests/dispatch-age.test.ts -->
`watchDispatch(projectRoot, config, options, onItems)` SHALL derive the
ordered dispatch items with `readDispatchItems` and `orderDispatchItems`,
with `firstSeenTimes` of `readWaitLog(projectRoot, options.home)`,
after each `createInvalidationHub` batch and every `inbox.pollSeconds`
through `options.every`, one derivation at a time, with a batch or poll
during one causing one more after it. After each derivation it SHALL call
`onItems(items, at, idle)` with the items, the clock time the derivation
started, and the dispatch's `watcherIdle`, then read the trees again through
`options.trees`, and when their `treeWatchPaths` differ from the watched
paths, close the hub, open a new one, and derive once more. A derivation
that throws SHALL call `options.stderr` with `osq inbox: <message>` and keep
watching. It SHALL take the same `watch`, `schedule`, `every`, `trees`,
`now`, and `stderr` seams as `followDispatch`, and `home`, defaulting to
`os.homedir()`, and return `{ close(): Promise<void> }`, which closes the
hub and cancels the poll. It SHALL derive once as soon as it starts.
`followDispatch` SHALL be built on it and print what it printed before.

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

#### Scenario: Idle and first seen
- **WHEN** the watcher has no runnable change and the wait log under `options.home` has the higher of two equal approval items first seen earlier
- **THEN** `onItems` gets `idle` true and the higher change id first

### Requirement: Card session
<!-- source: src/core/status/dispatch-session.ts, tests/dispatch-session.test.ts -->
`runCardSession(projectRoot, config, options)` SHALL run until the reviewer
quits. `options` SHALL hold `input` (`key(): Promise<string | null>` and
`line(question): Promise<string | null>`), `launch(args): Promise<number>`,
`sound`, `stdout`, `stderr`, `now`, `signal`, `recorder`, and the watch
seams of `watchDispatch`, `home` among them. The session SHALL keep at most
one pending `key()` read.

- It SHALL derive the ordered items with the first-seen times of the wait
  log under `options.home`, put the items skipped in this session after the
  rest in the order they were skipped, and print `formatCardScreen` for the
  first item with its card from `readDispatchCard`.
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
  nothing to the project itself; only launched commands write there. It
  SHALL record through `options.recorder` as "Wait recording" says.

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
