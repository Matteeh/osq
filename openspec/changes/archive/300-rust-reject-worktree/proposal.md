---
title: Rust osq reject rejects a change in its worktree
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-config, rust-storage, rust-vcs]
---
## Goal

With git on, an approved change runs in its own osq worktree, so a change
that fails is in that worktree, not the checkout. Rust `reject` (272) looks
only in the checkout, so it cannot reject such a change. This change makes
Rust `reject` find a change across the osq worktrees, as Rust `archive`
does since 295, and reject it there as TypeScript does: move it to
`openspec/changes/rejected/`, write the record, commit the move on
`osq/<folder>` and remove the worktree. The worktree is kept, with
TypeScript's reason, when the commit fails, the worktree has other changes
or git refuses the removal. The branch is always kept. The expected results
come from TypeScript itself: goldens that the built `dist` printed for
scratch repositories built from a fixture in this change folder.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints, every Rust test, the link gates and the mutation check of the
changed lines. It proves that Rust `reject` leaves the same output,
branches, worktrees, tip commit and status as TypeScript in every golden
case, fails on a config that does not load, and that every earlier approve
and reject test still holds.

## Non-goals

- Stacked changes; TypeScript restores their draft into the checkout, which a later item ports.
- The `vcs.author is required to commit a rejection` reason; Rust's config refuses `vcs.enabled` without an author, so it cannot happen.
- A CLI test; the CLI already dispatches `reject`.

## Surface

- Changed: `osq-rs reject <id> --reason <text>` (command): with git on, it rejects a change in its worktree and prints the worktree and branch lines

## Decisions

- ADR 022: worktree rejection stays in the approve feature crate and reaches git through the vcs kernel; it calls no other feature, so the tree lookup is written in this crate as archive wrote its own.
- ADR 023: path choice, the commit message and the output lines are pure functions; one orchestrator calls git and moves files.
- ADR 024: every public item ends its doc with `Implements: rust-approve/<requirement>`, and each new test names `Covers: rust-approve/<scenario>`.
- ADR 025: the rejected folder, `.run/rejected.md` and the event are written as today; the commit holds them as TypeScript's does.
- ADR 026: no OpenSpec parsing changes.
- ADR 027: no scheduling changes.
- ADR 028: `reject` stays one command of `ApproveFeature`.
- ADR 029: `reject` reads `osq.toml` with `load_config` for `vcs` and `timeouts`, and a config error fails it with its display.

## Assumptions

- When git refuses the commit or the removal, the kept line's reason is the `VcsError`'s display, which holds git's message but not TypeScript's exact text; the test checks the phrase only.
- Every golden was printed by `golden/print-reject-worktree-goldens.mjs.txt` with the built `dist` of this repository on 2026-10-23.

## Contract

### Requirement: Worktree rejection

See `specs/rust-approve/spec.md`, with "Worktree rejection".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-approve/spec.md`: ADDED "Worktree rejection".
- `fixture/reject-worktree/` holds the fixture change folders, and `golden/` the goldens and their script, that task 1 copies to `crates/features/approve/tests/fixtures/`.
