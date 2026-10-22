---
queue_item: rust-inbox-pending-items
queue_hash: sha256:a49837a340b54fe9c0e64ea531668740ad3fbac283d4149c507d625cbe742ee8
planner: null
date: 2026-10-22
---

### Goal

The Rust inbox still leaves out three cards TypeScript shows: a task paused by a usage limit, a failed after-land command, and an autopilot stop.

### Context

As of 2026-10-22:

- TypeScript builds them in `src/core/status/inbox-paused.ts` (`projectPaused`), `afterLandFailedItem` and `autopilotStoppedItem` in `src/core/status/inbox-projection.ts`, reading `.run/paused.md`, the after-land failure record and the autopilot stop record.
- 270 adds the archived cards and reads every tree with vcs on.

### Requirements

- The Rust inbox shows the three cards with TypeScript's text, in its order, and none when no record exists.
- Tests write each record on a fixture and compare with TypeScript's text.

### Non-goals

- Acting on the cards.
