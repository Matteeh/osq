---
title: Rust osq show prints the land lines with vcs on
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-config, rust-vcs, rust-storage]
---
## Goal

With git on, `osq show <id>` tells the human whether an archived change
has landed and what `osq land` will do. 274 ported show with git off only,
so Rust always prints `Land: git is off` and `Next: landed`, never finds a
change that lives only in an osq worktree, and drops the `Diff:` and
`Sync stopped:` lines. This change makes Rust show read `osq.toml` and
git as TypeScript does: it finds changes across worktrees with
`vcs.enabled`, prints TypeScript's landed and not-landed headlines and
`Diff:` line, the `archived (not landed) — osq land <id>` next step, and
the `Sync stopped:` line. With git off the output is unchanged.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints and every Rust test, the link gates and the mutation check of the
changed lines included. It proves each land row on a scratch git
repository, with worktrees for the branch rows, byte for byte against
TypeScript's output, and that every earlier show golden still matches.

## Non-goals

- `--json`.
- Other git-dependent details of active changes, such as `Runs after:` across trees or dependency readiness of landed changes; lookup across trees is the only active-change difference.
- The `osq status` sync lines; only `show`'s `Sync stopped:` line is ported.

## Surface

None

## Decisions

- ADR 022: show reads git only through the vcs kernel and the change trees through the storage kernel, as the inbox does; it depends on no other feature crate.
- ADR 023: the headline, `Diff:` and `Sync stopped:` lines are pure functions of read facts; one reader holds the git calls.
- ADR 024: every public item ends its doc with `Implements: rust-show/<requirement>`, and each test names `Covers: rust-show/<scenario>`.
- ADR 025: show reads `osq.toml`, the change folders and `change.jsonl` as they are, and writes nothing.
- ADR 026: no OpenSpec reading changes.
- ADR 027: no scheduling changes.
- ADR 028: `ShowFeature` stays a unit struct with its one command.
- ADR 029: `vcs.enabled`, `vcs.defaultBranch` and the git timeouts come from `Config`; a bad `osq.toml` fails show with the config error.

## Assumptions

- "Git on" follows TypeScript's `selectVcs`: the root must be the repository's top level, and `vcs.enabled` is not needed for the `Land:` headline, only for lookup across worktrees and the not-landed `Next:` step. The golden row `no branch` without `vcs.enabled` pins that split (`Next: landed` with a not-landed headline), as TypeScript prints it.
- The brief's "worktree line" is read as the lines a worktree change brings: finding a change that lives only in an osq worktree, its `Diff:` line, and the `Sync stopped:` line a worktree sync writes. TypeScript's show prints no line that names the worktree path.
- The goldens in this change folder's `goldens/` were printed by `print-land-goldens.mjs.txt` from the built TypeScript CLI on 2026-10-22; the task copies both into the crate's fixtures.

## Contract

### Requirement: Show git state

See `specs/rust-show/spec.md`.

### Requirement: Show land lines

See `specs/rust-show/spec.md`, and the MODIFIED "Show lookup" and "Show status and next step".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-show/spec.md`: ADDED "Show git state" and "Show land lines"; MODIFIED "Show lookup", so it lists changes across trees with `vcs.enabled`, and "Show status and next step", so an archived change that has not landed is `archived (not landed)`.
