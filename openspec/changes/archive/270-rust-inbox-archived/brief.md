---
queue_item: rust-inbox-archived
queue_hash: sha256:63afcd42f5288570690d1d025b56bf53eacecb94c1f14e7e53b01a98305d9c08
planner: null
date: 2026-10-21
---

### Goal

The Rust inbox left out the archived-not-landed and archived steering cards, because TypeScript shows them only when `vcs.enabled` is on and Rust could not read config or worktrees then.

### Context

As of 2026-10-21:

- Left out of 244. TypeScript builds these cards in `src/core/status/dispatch-cards.ts` and `status.ts`.
- The config kernel gives `VcsConfig` (252); `rust-worktree-changes` makes the storage listing read worktrees.

### Requirements

- With vcs enabled, the inbox shows the archived-not-landed and archived steering cards TypeScript shows, with the same text and order; with vcs off it shows neither.
- Tests use scratch repositories with worktrees.

### Non-goals

- Acting on the cards.
