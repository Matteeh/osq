# Spec Delta: web-inspection

## MODIFIED Requirements

### Requirement: Invalidation across worktrees
`osq serve` SHALL resolve the change trees through `changeTrees`, and the
tree record path through `treeRecordPath`, when it starts, and pass both to
the invalidation hub through `createTreeHub` in
`src/core/web/web-tree-hub.ts`. The hub SHALL watch the configured OpenSpec
root of the first tree, the change folder of each worktree tree, and, when
`recordPath` is given, the tree record. A notification inside a worktree
tree's change folder SHALL invalidate that change's numeric id. A
notification on the tree record SHALL be a global invalidation. Without
resolved trees, the hub SHALL watch the project root's OpenSpec root as
before.

After each batch it sends, and every `inbox.pollSeconds`, the server SHALL
resolve the trees again. When their `treeWatchPaths` differ from the watched
paths, it SHALL open a hub over the new trees and the same record path, close
the old hub, and send connected clients one changed event with an empty id
list. Clients SHALL stay connected across the swap. Resolutions SHALL run
one at a time, and a failed resolution SHALL keep the current hub. Server
shutdown SHALL cancel the poll timer along with the rest. `startWebServer`
SHALL take a `trees` seam, defaulting to `changeTrees`, and an `every` seam,
defaulting to `setInterval`, beside `watch` and `schedule`.

#### Scenario: Edit in a worktree folder
- **WHEN** a file inside a worktree tree's change folder `001-a` changes
- **THEN** connected clients receive one changed event with ids `[1]`

#### Scenario: Server wiring
- **WHEN** `startWebServer` starts with `vcs.enabled` and one osq worktree
- **THEN** the hub's watcher is given the OpenSpec root and that worktree's change folder

#### Scenario: Tree record in the server's watch
- **WHEN** `startWebServer` starts with `vcs.enabled` on a temporary repository's checkout
- **THEN** the hub's watcher is given `<checkout>/.git/osq-trees.jsonl` among its paths

#### Scenario: Tree record change
- **WHEN** the tree record changes while the trees stay the same
- **THEN** connected clients receive one changed event with ids `[]` and the watcher is not replaced

#### Scenario: New worktree while serving
- **WHEN** the `trees` seam returns a second worktree tree after the first batch
- **THEN** a second watcher opens over the new paths, the first watcher closes, and connected clients receive a changed event with ids `[]` after the batch's own event

#### Scenario: Poll finds a new worktree
- **WHEN** the `trees` seam returns a second worktree tree and the manual poll timer fires with no watcher event
- **THEN** a second watcher opens over the new paths and connected clients receive one changed event with ids `[]`

#### Scenario: Server closes the poll
- **WHEN** the server closes
- **THEN** the poll timer is cancelled and the current watcher is closed
