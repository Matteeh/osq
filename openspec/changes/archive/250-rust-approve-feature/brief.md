---
queue_item: rust-approve-feature
queue_hash: sha256:e174419f14fdad08a86b359e3beae268e42a927eebd5133d3d244d4aad942f4e
planner: null
date: 2026-10-21
---

### Goal

Approval is the human's gate. The approve feature computes the seal, checks the change, and writes `.run/approved`, so a Rust loop can trust approvals it did not see happen.

### Context

As of 2026-10-21:

- `crates/features/approve` (`osq-feature-approve`, capability `rust-approve`) is a placeholder.
- Core and storage compute ADR 025's byte-compatible seal (223). The specs kernel validates a change (219).
- TypeScript: `src/core/spec/approve.ts` (`approveSpec`), `hasher.ts`, and the worktree and steering paths in `approve-worktree*.ts`, `approve-steer.ts` and `approve-default-branch*.ts`.

### Requirements

- The approve feature's `approve` command, for a change in the checkout with `vcs` off, refuses a change that fails validation with TypeScript's message, and otherwise writes `.run/approved` with the same content and seal TypeScript writes.
- A change already approved with the same seal is a no-op; one whose files changed since approval gets TypeScript's message.
- Tests on fixture changes compare each marker with the one TypeScript wrote once and committed.

### Non-goals

- Worktrees, branches, stacking, steering and the default-branch paths; they need config and worktree reads in Rust.
- `osq lint`'s full rule set beyond what the specs kernel validates.
