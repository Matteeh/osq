---
title: The Rust inbox lists archived-not-landed changes and archived steering
depends_on: ["264"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-storage, rust-config, rust-vcs]
---
## Goal

The Rust inbox reads only the project root, so with `vcs.enabled` it misses
what TypeScript shows. It misses every change running in an osq worktree,
the archived changes that wait for `osq land`, and the archived changes
that need steering. This change loads `osq.toml`. With vcs on, the inbox
reads every tree's changes through the storage kernel's tree listing and
adds the two archived cards with TypeScript's text and order. With vcs off
it reads the root as before and shows neither card.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic lints
and every Rust test, the corpus link gates included. It proves the new
inbox tests pass over scratch git repositories with worktrees, and that the
existing inbox tests and the TypeScript golden still pass.

## Non-goals

- Acting on the cards: `osq land` and `osq plan` are other features.
- The after-land-failed, paused and autopilot-stopped items.
- Auto-steer outcomes on steering lines.

## Surface

None

## Decisions

- ADR 022: the inbox feature builds its trees from the config, vcs and storage kernels; it does not call the plan feature's copy of that code.
- ADR 023: the item lines stay pure functions of snapshots and git facts; only `run` reads config and git.
- ADR 024: every public item ends its doc with `Implements: rust-inbox/<requirement>`, and each test names `Covers: rust-inbox/<scenario>`.
- ADR 025: no on-disk format changes; the inbox still writes nothing.
- ADR 026: no spec parsing changes.
- ADR 027: no scheduling changes.
- ADR 028: `InboxFeature` keeps its one command and refusals.
- ADR 029: the vcs flag, default branch, worktree root and git timeouts come from `osq.toml` through the config kernel.

## Assumptions

- TypeScript's expected lines were printed once with `dist` over the scratch repository the scenario describes, with vcs on and off. The scenario's lines are those outputs.
- Reading active changes across trees is in scope. Without it, the inbox would show the archived cards while still missing a dead task in a worktree, and TypeScript's text differs there.
- With vcs on, a root that is not a git repository reads the root alone, as TypeScript's `NoVcs` selection does.

## Contract

### Requirement: Inbox trees

See `specs/rust-inbox/spec.md`, with "Inbox command" and "Archived items".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-inbox/spec.md`: MODIFIED "Inbox command"; ADDED "Inbox trees" and "Archived items".
