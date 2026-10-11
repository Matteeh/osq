---
title: --follow and the dashboard see new worktrees and landings when they happen
depends_on: []
verify: pnpm verify
features:
  reads:
    - metrics-and-reporting
---
## Goal

`osq inbox --follow` and the dashboard should react to approvals, stacked
cuts, archives and landings as they happen. Today `--follow` may lag up to one
poll (`inbox.pollSeconds`, 30 s), and a long-running `osq serve` never sees a
worktree created after it started.

Today:

- `osq serve` resolves the change trees through `changeTrees` once, at
  startup. A worktree approved or cut later is never watched, so a server
  started days ago shows nothing about changes approved since, until restart.
- `--follow` re-reads the trees after each derivation, but a stacked cut
  happens in a new worktree and a `.stacked` folder, neither of which is
  watched. It waits for the 30 s poll.

With this change, every git write osq makes that can change the trees
(`worktreeAdd`, `worktreeRemove`, `worktreePrune`, `commit`, and a
`fastForward` that lands) appends one line to `osq-trees.jsonl` in the
repository's common git directory (`.git/osq-trees.jsonl` in the checkout,
shared by every linked worktree). Both `--follow` and the dashboard watch that
file. A line appended there is a global invalidation, after which each one
resolves the trees again and opens a new watcher when the watched paths
changed. The dashboard also re-resolves its trees after every batch and every
`inbox.pollSeconds`, as `--follow` does. That poll stays as a slow backstop
for landings made outside osq, and its default rises from 30 to 300 seconds.

Approvals, cuts, archives and lands all end in one of those git writes: an
approval's commit in its new worktree, a stacked cut's commit, an archive
commit, and a land's fast-forward and worktree removal. A stacked approval
writes no git, but it removes the checkout's draft folder, which the OpenSpec
root watch already sees. Re-resolving the trees after that batch finds the
stacked tree.

Latency for a stacked cut on `--follow`: before, up to `inbox.pollSeconds`
(30 s); after, `inbox.eventDebounceMs` (200 ms) plus one derivation. On the
dashboard, a new worktree used to show only after a restart. It now shows
within `serve.eventDebounceMs` (100 ms) of the record line, plus one tree
resolution.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test (the new tree record,
follow and serve tests, and the existing watcher, inbox, serve and config
tests), and lint, on the final tree.

## Non-goals

- Push notifications to a phone.
- Watching git's own internal files (refs, `worktrees/`, `HEAD`). osq watches
  only the file it writes itself.
- Watching the folder inside a `.stacked` approval for edits. The trees
  resolve it as before, and only the checkout and worktree change folders are
  watched.
- Reading the record's contents. Nothing in osq parses it. It exists only to
  be watched, and deleting it changes nothing but how soon a watcher notices.
- Trimming the record. One short line per write stays small, and a human may
  delete the file at any time.

## Surface

- Added: file `osq-trees.jsonl` in the repository's common git directory, one
  JSON line `{"at","op","root"}` per osq git write that can change the trees.
- Changed: config key `inbox.pollSeconds` default from `30` to `300`; the
  dashboard server now re-resolves its trees on the same interval.

## Decisions

- ADR 001: unchanged. The new default loads through the existing config path.
- ADR 004: unchanged. No OpenSpec validator run is touched.
- ADR 005: unchanged. No validator version check is touched.
- ADR 010: unchanged. The validator role is not touched.
- ADR 012: unchanged. The watch service restarts nothing new. Its watcher's
  git writes append to the record like any other osq git write.
- ADR 013: `osq serve` still binds only loopback. The tree record changes what
  the server watches, not who can reach it or write through it.
- ADR 015: unchanged. `osq mcp` exposes no watch or vcs tool.

## Assumptions

- The record lives inside `.git`, which no working tree tracks. It never shows
  in `git status`, never blocks a fast-forward, and is shared by every linked
  worktree through `git rev-parse --git-common-dir`.
- chokidar 4 sees a watched file that does not exist yet, as long as its
  directory exists (checked by hand on 2026-10-11), so a fresh repository's
  record fires on its first line. The common git directory always exists in
  a repository.
- A watch on `.git/osq-trees.jsonl` costs one inotify watch on `.git`. The
  worktree root stays on the Linux filesystem under WSL2 (`~/.osq/worktrees`
  by default), where inotify works.
- Every task commit in a worktree now also sends the dashboard one global
  invalidation, so it refetches the shared documents once per commit. That
  costs one refetch per commit, once a debounce has passed.
- `src/core/web/web-server.ts` has 244 lines against the 250-line budget.
  Task 3 replaces the hub setup there with one call and must stay under it.

## Contract

The version-control, status-inspection, web-inspection and cli-foundation
deltas below are the contract.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/version-control/spec.md`: ADDED "Tree record".
- `specs/status-inspection/spec.md`: MODIFIED "Dispatch watch".
- `specs/web-inspection/spec.md`: MODIFIED "Invalidation across worktrees".
- `specs/cli-foundation/spec.md`: MODIFIED "Inbox configuration".

Task 2 adds the hub's `recordPath` option in `src/core/web/web-events.ts`.
Task 3 calls it without editing that file. No file is shared between tasks.
