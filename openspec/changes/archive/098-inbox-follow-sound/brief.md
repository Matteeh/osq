---
queue_item: inbox-follow-sound
queue_hash: sha256:7277e5f5c2b1edb9f6775c570fae3abee7570447e8bc7188b489e7cbf0c4b787
planner: null
date: 2026-09-27
---

### Goal

A reviewer leaves `osq inbox --follow` running on their own machine. When an item appears that was not there before, a short sound plays. The watcher never makes a sound.

### Context

- `inbox-dispatch-order` added `osq inbox` and its items.
- `src/core/web/web-events.ts` already watches every change tree, worktrees included, for `osq serve`'s invalidation. chokidar is a runtime dependency.
- The watcher may run somewhere with no audio device. `osq inbox` runs on the host and only reads files.
- osq keeps its runtime dependencies to chokidar, yaml, commander, and jiti.

### Requirements

- `osq inbox --follow` re-derives the items whenever a change tree changes, prints each item that appears, and keeps running until interrupted. An empty inbox waits.
- A sound plays when an item appears that was not there before. Items that appear within a few seconds of each other (a config value) make one sound. Items present at start make no sound.
- `inbox.sound` in `osq.config.ts` is `default`, `bell`, `off`, or a path to a sound file. `default` plays a short sound file osq ships, through the first player found: `afplay` on macOS, then `pw-play`, `paplay`, or `aplay` on Linux. With no player, it rings the terminal bell.
- `inbox.quietHours`, such as `22:00-07:00` in local time, silences the sound. Items still appear.
- The watcher never plays a sound.

### Non-goals

- Cards and keys. Those come with `inbox-cards`.

### Notes for planning

- Test the sound through an injectable player, so no test makes noise.
- Generate the sound file with a script in the repository, so it is original, and keep it under a few kilobytes. Ship it in the package.
