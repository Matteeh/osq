---
title: Rust osq land removes a landed change's worktree
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-config, rust-vcs, version-control]
---
## Goal

Rust land prints `<folder> has already landed; Rust land does not remove
worktrees yet` and never removes a worktree, so landed worktrees pile up
under `~/.osq/worktrees`. Change 321 made TypeScript's land copy the
change's logs into the checkout, delete the whole worktree folder with its
ignored files, prune git's records, and fail loudly when a step fails, both
right after the land commit and on a later land of a change that already
landed. This change ports that cleanup to the Rust land feature with
TypeScript's lines and exit codes.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test and
the mutation check on the touched lines. That covers the new
`tests/land_cleanup.rs`, which proves "Cleanup outcomes" and "Cleanup of a
landed change" on scratch repositories with a configured worktree root,
and the landed text in `tests/land_lookup.rs`, `tests/refusals.rs` and
`tests/land_after_retry.rs`; every other land test passes unchanged.

## Non-goals

- Stacked changes.
- Removing the branch `osq/<folder>`; land keeps it, as TypeScript does.
- A worktree outside the configured worktree location. Land removes only
  the folder "Worktree location" gives, as TypeScript does.

## Surface

- Changed: Rust `osq land <id>` prints `Removed worktree <path>` or `Could not remove worktree <path>: <cause>` after `Landed <folder> as <commit>`, and exits 1 on the second.
- Changed: Rust `osq land <id>` for a landed change prints `<folder> has already landed` and the cleanup line, replacing `<folder> has already landed; Rust land does not remove worktrees yet`.

## Decisions

- ADR 003: land deletes only the worktree folder and runs only `git worktree prune`; no branch is removed and no history is rewritten.
- ADR 022: the worktree path comes from the config and the vcs kernel's `stacked_root`, as the approve crate computes it, without depending on the approve crate.
- ADR 023: the three cleanup steps are small named functions in their own module; `land.rs` only calls the cleanup and places its line.
- ADR 024: every new function names "Land cleanup" and each test its scenario.
- ADR 025: the copied logs keep TypeScript's layout under the checkout's archived change folder.
- ADR 026: no OpenSpec parsing is involved.
- ADR 027: the change locks only the land crate, so it runs beside changes in other crates.
- ADR 028: the land feature's commands and its `Feature` stay as they are; only its output changes.
- ADR 029: `vcs.worktreeRoot` and the git timeouts come from `load_config`.

## Assumptions

- `<cause>` is the Rust error's display, such as `Permission denied (os error 13)`, where TypeScript prints Node's message, such as `EACCES: permission denied, unlink '<file>'`. The line's start and the exit code match.
- For a landed change, Rust runs the cleanup before the after-land retry, where TypeScript runs the retry first. The two touch different folders, and the printed order is TypeScript's.
- The existing land tests put worktrees under `<scratch>/worktrees`, not at the configured worktree location, so their land finds nothing to remove: a fresh land's output stays the same, and a landed change's line becomes `<folder> has already landed; nothing to clean up`.
- The tests check the texts literally, taken from version-control "Land cleanup", rather than against TypeScript's `dist`: every line is a fixed text around the worktree path.
- The failing-removal row needs a user that file permissions bind, as 321's test did; it cannot fail as root.

## Contract

### Requirement: Land cleanup

See `specs/rust-land/spec.md`: Rust land removes the change's worktree
after a land and on a later land, with TypeScript's lines.

#### Scenario: Cleanup outcomes
- **WHEN** a change lands whose worktree sits at its configured location
- **THEN** land prints `Removed worktree <path>`, or `Could not remove worktree <path>: <cause>` and exits 1

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-land/spec.md`: MODIFIED "Land lookup", "Land commit", "Land refusals" and "Land after-land retry"; ADDED "Land cleanup". Task 1.
