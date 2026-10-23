---
title: Rust osq sync and osq message
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-config, rust-harnesses, rust-specs, rust-storage, rust-vcs]
---
## Goal

`osq sync <id>` merges a newer default branch into a change's branch
without landing it, and `osq message <id>` prints the land commit message
an archived change will get. Rust has neither. 294 already merges the
default branch inside `land`, and 256 already builds the land message, so
this change adds both commands to `LandFeature`, the crate that owns that
code, since a feature never calls another feature. `sync` runs land's sync
on an archived worktree change and prints TypeScript's result line;
`message` prints the message `land` would commit. The expected results
come from TypeScript itself: goldens printed by the built `dist` from
scratch repositories and committed in this change folder.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints and every Rust test, the link gates and the mutation check of the
changed lines included. It proves that Rust `sync` and `message` give
TypeScript's output or refusal on every golden row, including the branch
tip, the worktree status and the merged living spec after a sync, that
`sync` records no land stop where `land` does, that both refuse an active
or stacked change and bad arguments, and that every earlier land test,
the stop record included, still passes.

## Non-goals

- The bridge commit for stacked changes; Rust `sync` and `message` refuse any change with a `.run/stacked-on`.
- Syncing an active change, which TypeScript does with per-task verify reruns and recertification; Rust `sync` refuses it.
- A change found only in the checkout, which TypeScript's `sync` would sync in place; Rust `sync` looks only in osq worktrees.
- TypeScript's stderr lines: the sync's progress line and the message's `Branch: osq/<folder>`; a Rust feature returns one text.
- The `sync_stopped` event TypeScript appends for an active change's stop.
- A CLI test; the CLI already dispatches every command `LandFeature` lists.

## Surface

- Added: `osq-rs sync <id>` (command)
- Added: `osq-rs message <id>` (command)

## Decisions

- ADR 003: `sync` writes git only on `osq/<folder>` in the change's worktree, through land's sync; `message` runs no git write.
- ADR 007: every command the sync runs, `vcs.prepare`, verify and check, still goes through `run_verify`, so no model key reaches it.
- ADR 022: both commands live in the land crate, which already owns the sync and the message, and call only the kernels land already uses; no feature calls another.
- ADR 023: the status filter, lookups and output lines are small pure functions; one orchestrator per command holds the IO, reusing land's settings, worktree lookup and sync.
- ADR 024: every public item ends its doc with `Implements: rust-land/<requirement>`, and each new test names `Covers: rust-land/<scenario>`.
- ADR 025: the commands read today's worktrees, archived folders and `.run` files as they are, and the sync leaves TypeScript's commit, files and status.
- ADR 026: the sync's spec rebuild still goes through the specs kernel's `merge_change`, as 294 built it.
- ADR 027: no scheduling changes.
- ADR 028: `LandFeature` stays a unit struct and lists `land`, `sync` and `message` as data; `run` dispatches on the invocation's command.
- ADR 029: `vcs.enabled`, `vcs.author`, `vcs.defaultBranch`, `vcs.prepare` and the timeouts come from `osq.toml` through the config kernel.

## Assumptions

- A failure displays as `sync failed: <TypeScript's message>` or `message failed: <TypeScript's message>`, the core `FeatureError::failed` wrapper every Rust command uses, and exits 1 as TypeScript's `CommandError` does.
- A stop from `osq sync` records nothing, as TypeScript's `syncChange` records nothing for an archived change; the `code-conflict-001` golden shows the branch tip unchanged and no `.run/regressed/change.md`.
- The new refusals for an active or stacked change have no TypeScript text, since TypeScript syncs both; they name what Rust does not do yet, as land's stacked refusal does.
- Rust's spec rebuild gives the same merged `orders` spec as TypeScript's for the `spec-conflict-001` row; 219 proved `merge_change` against the Node validator, and the golden checks it here.
- Every golden was printed by `golden/print-sync-message-goldens.mjs.txt` with the built `dist` of this repository on 2026-10-23. The TypeScript sync of the land crate's fixture change with a moved `main` fails in TypeScript (its empty `## ADDED Requirements` delta makes `git add` of a missing living spec fail), so the merging rows use a small change with a real delta instead.

## Contract

### Requirement: Sync command

See `specs/rust-land/spec.md`, with "Message command" and the MODIFIED
"Land feature" and "Land arguments".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-land/spec.md`: MODIFIED "Land feature" (three commands) and "Land arguments" (a new scenario for `sync` and `message`); ADDED "Sync command" and "Message command".
- `golden/` holds `sync.json`, `message.json` and the script that printed them, which task 1 copies to `crates/features/land/tests/fixtures/sync-message-golden/`. The scratch repositories copy the crate's existing `tests/fixtures/land-change/001-alpha-orders`.
