## ADDED Requirements

### Requirement: Invalidation across worktrees
<!-- source: src/core/web/web-server.ts, src/core/web/web-events.ts, src/core/web/web-trees.ts, tests/serve-sse-worktrees.test.ts -->
`osq serve` SHALL resolve the change trees through `changeTrees` once at
startup and pass them to the invalidation hub. The hub SHALL watch the
configured OpenSpec root of the first tree and the change folder of each
worktree tree. A notification inside a worktree tree's change folder SHALL
invalidate that change's numeric id. Without resolved trees, the hub SHALL
watch the project root's OpenSpec root as before.

#### Scenario: Edit in a worktree folder
- **WHEN** a file inside a worktree tree's change folder `001-a` changes
- **THEN** connected clients receive one changed event with ids `[1]`

#### Scenario: Server wiring
- **WHEN** `startWebServer` starts with `vcs.enabled` and one osq worktree
- **THEN** the hub's watcher is given the OpenSpec root and that worktree's change folder
