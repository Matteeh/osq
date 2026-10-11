---
queue_item: event-driven-follow
queue_hash: sha256:65505db97c8dac791f0f1972738d2ae7a2d2b7ce539cef05d383c37aa6fa67ca
planner: null
date: 2026-10-11
---

### Goal

`osq inbox --follow` and the dashboard, on a laptop or a long-running server, react to approvals, stacked cuts, archives and landings as they happen, instead of up to one poll later or not until a restart.

### Context

As of 2026-10-10 (Notion: "IMPORTAN INBOX ITEM NEEDS READING AND IMPROVEMENTS", on the polling design of 098):

- web-inspection's "Invalidation across worktrees" resolves the change trees through `changeTrees` once, when `osq serve` starts, and watches the OpenSpec root and each worktree's change folder. A worktree created after startup is never watched, so a server started days ago misses every change approved since, until it restarts.
- status-inspection's "Dispatch follow" re-reads the trees after each derivation and derives every `inbox.pollSeconds` (30), because approvals, stacked cuts, archive commits and hand landings change no watched file.
- `createInvalidationHub` is the one file watcher both use.
- osq itself makes every git write that creates or removes a worktree, cuts a stacked change, or lands (ADR 003).

### Requirements

- Every osq operation that creates or removes a worktree, cuts a stacked change, archives or lands records that it did, in a place `--follow` and the dashboard watch, so they re-resolve the trees and refresh at once.
- The dashboard re-resolves its watched trees when they change, as `--follow` does, so a long-running server sees new worktrees.
- A landing made outside osq still shows up within the poll interval.
- `inbox.pollSeconds` stays as a slow backstop, with a longer default.
- Nothing is written that is not derived from or alongside osq's own writes; deleting the record changes nothing but speed.

### Non-goals

- Push notifications to a phone.
- Watching git's internal files when an osq-written record covers the case.

### Notes for planning

- Weigh the options on the Notion page: an append-only events file that osq's own git writes touch, against watching git's worktree records and refs. Mind file events under WSL2 and inotify limits.
- Measure how long a new item takes to reach `--follow` and the dashboard before and after.
