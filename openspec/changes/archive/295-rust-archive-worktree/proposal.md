---
title: Rust archive archives a change in its worktree and commits it
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-storage, rust-specs, rust-config, rust-vcs]
---
## Goal

With git on, TypeScript archives a finished change inside its osq worktree
and commits the move on the change's branch, so land can find it. Rust
`osq archive <id>` (248) finds only a change directly under the checkout's
`openspec/changes/`. This change makes it read the config and, with vcs
on, find the change across the checkout and its osq worktrees, archive it
in the tree it sits in exactly as before, and, for a worktree change,
commit the move on `osq/<folder>` with TypeScript's paths, message and
archive name. With vcs off, or for a change in the checkout, nothing
changes. The expected branch tip, commit and status come from TypeScript
itself: goldens printed with the built `dist` from scratch repositories
built from the archive crate's existing fixture.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints and every Rust test, the link gates and the mutation check of the
changed lines included. It proves that a worktree archive leaves the same
commit, message, archive folder and clean status as TypeScript, that a
taken archive name gets TypeScript's suffix in the commit, that a checkout
change with git on is archived with no commit, that a failed commit leaves
what TypeScript leaves and fails, and that every 248 test still passes.

## Non-goals

- Stacked approvals; their trees are left out of the lookup.
- The archive-time `check:` command, the archive verify runs, and the worktree halts TypeScript's `archiveCompletedSpec` runs first (`worktree_off_branch`, `worktree_dirty`, and the sync with the default branch).
- The `archived` event, as in 248.
- Any change to the vcs, storage or config kernels, or to the CLI app.

## Surface

- Changed: `osq archive <change>` (Rust) output, which for a change in an osq worktree reads `<archive path> on osq/<folder>`.

## Decisions

- ADR 022: archive stays one feature crate. It adds `osq-kernel-config` and `osq-kernel-vcs`, lists trees through rust-storage's `change_trees` and `list_tree_changes`, and calls no other feature.
- ADR 023: picking the commit paths and building the commit message are pure functions; the orchestrator holds the config read, the git calls and the file writes.
- ADR 024: every public item ends its doc with `Implements: rust-archive/<requirement>`, and each test names `Covers: rust-archive/<scenario>`.
- ADR 025: archive reads `osq.toml` and today's worktree layout, and leaves the same files and commit as TypeScript.
- ADR 026: deltas still merge only through the specs kernel's `merge_change`.
- ADR 027: the task scopes the archive crate and `Cargo.lock`, so it does not run beside another change that scopes `Cargo.lock`, such as 298.
- ADR 028: `ArchiveFeature`'s name, commands and usage do not change.
- ADR 029: `vcs.enabled`, `vcs.author` and the git timeouts come from `osq.toml` through the config kernel.

## Assumptions

- A failed archive commit fails Rust `archive` with `osq could not commit the archive of <folder>: <error>`, where TypeScript only logs `archive commit failed: <error>` and goes on; the files left behind are the same.
- The worktree `Output` text `<archive path> on osq/<folder>` is new, so a human running `osq archive` in the checkout sees where the archive went; TypeScript has no archive command.
- rust-storage `read_change`'s `title` equals the trimmed title TypeScript's `parseSpecMdFromFolder` gives, which the golden's message shows for the fixture.
- Every golden was printed by `golden/print-archive-worktree-goldens.mjs.txt` with the built `dist` of this repository on 2026-10-22, after which the archived `.run/events/change.jsonl`, holding only TypeScript's `archived` event, was deleted before the commit, as the script says.

## Contract

### Requirement: Worktree archive

See `specs/rust-archive/spec.md`, with the MODIFIED "Change lookup".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-archive/spec.md`: MODIFIED "Change lookup"; ADDED "Worktree archive".
- `golden/` holds the goldens and the script that printed them, which task 1 copies to `crates/features/archive/tests/fixtures/worktree-golden/`. The scratch repositories are built from the crate's existing `tests/fixtures/project`.
