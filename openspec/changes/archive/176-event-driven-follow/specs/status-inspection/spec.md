# Spec Delta: status-inspection

## MODIFIED Requirements

### Requirement: Dispatch watch
`watchDispatch(projectRoot, config, options, onItems)` SHALL derive the
ordered dispatch items with `readDispatchItems` and `orderDispatchItems`,
with `firstSeenTimes` of `readWaitLog(projectRoot, options.home)`,
after each `createInvalidationHub` batch and every `inbox.pollSeconds`
through `options.every`, one derivation at a time, with a batch or poll
during one causing one more after it. When it starts, it SHALL resolve the
tree record path once with `treeRecordPath(projectRoot, config)` and pass it
as `recordPath` to every hub it opens, so an osq git write that changes the
trees fires a batch. After each derivation it SHALL call
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

#### Scenario: Tree record watched
- **WHEN** `watchDispatch` starts with `vcs.enabled` on a temporary repository's checkout
- **THEN** the fake watcher is given `<checkout>/.git/osq-trees.jsonl` among its paths

#### Scenario: Tree record fires
- **WHEN** the fake watcher fires on the tree record path and the manual poll timer never fires
- **THEN** `onItems` is called again and `options.trees` is read again
