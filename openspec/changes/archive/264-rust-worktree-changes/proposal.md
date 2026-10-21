---
title: Rust lists the changes in osq worktrees as well as in the checkout
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-config, rust-core, version-control]
---
## Goal

Rust reads change folders only from the checkout. On a project with `vcs.enabled`, approved changes run in osq worktrees and stacked approvals, so Rust cannot see them. As a result, plan numbering can hand out a number a worktree already holds, and the inbox misses running changes.

After this change:
- The storage kernel lists the changes of every tree it is given, with TypeScript's rules for which tree a change comes from.
- The vcs kernel knows where stacked approvals live.
- Plan numbering counts every tree and every `osq/` branch, as TypeScript's `nextChangeNumber` does.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, `cargo clippy` with `-D warnings` and pedantic lints, and every Rust test. That includes the new tree tests on scratch folders, the stacked-root table, and plan tests on scratch git repositories with real worktrees.

## Non-goals

- Changing what the inbox, approve, land or the queue projection do with worktree changes; each reads the checkout as today until its own item.
- Reading git or config inside the storage kernel; its caller passes the worktrees and stacked folders.
- The worktree path of one change (`worktreePath`), which nothing in Rust needs yet.

## Surface

None

## Decisions

- ADR 022: storage stays below vcs. `change_trees` takes plain `TreeCandidate` data, so storage gains no dependency. Plan, a feature, calls vcs, config and storage, and gains the vcs and config kernels as dependencies.
- ADR 023: `stacked_root` and the listing rules are pure functions over their inputs. Only plan's numbering holds the git IO.
- ADR 024: every public item this change adds or changes ends its doc with `Implements: <capability>/<requirement>`, and every new test names `Covers: <capability>/<scenario>`.
- ADR 025: the trees are today's checkout, `vcs.worktreeRoot` worktrees and `.stacked` folders, read as TypeScript reads them.
- ADR 026: nothing here parses OpenSpec.
- ADR 027: nothing here schedules.
- ADR 028: `PlanFeature`'s commands and arguments do not change.
- ADR 029: plan reads `vcs` and `timeouts` through `load_config`, and the vcs kernel takes `&VcsConfig`, never `osq.toml` itself.

## Assumptions

- `ChangeEntry` keeps its fields, because storage tests build it as a struct literal. An entry's `path` already points into the tree it came from, so no `tree` field is added.
- The home for `~` comes from the `HOME` variable, as TypeScript's `os.homedir()` reads it on Linux and macOS. With `HOME` unset, plan counts no stacked folders.
- No `osq.toml` exists in this repository or in the plan fixtures, so `load_config` gives `vcs.enabled` false there and every existing plan test keeps its result.
- Task 3 changes `crates/features/plan/Cargo.toml`, so since 235 it may change `Cargo.lock` without scoping it.
- The queue projection in `crates/features/plan/src/queue.rs` still reads only the checkout. A queue item whose change runs in a worktree stays unplanned there until the queue gets its own item.

## Contract

### Requirement: Change trees

See `specs/rust-storage/spec.md`.

### Requirement: Change listing across trees

See `specs/rust-storage/spec.md`.

### Requirement: Stacked approvals folder

See `specs/rust-vcs/spec.md`.

### Requirement: Next change number

See `specs/rust-plan/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-storage/spec.md`: ADDED "Change trees" and "Change listing across trees".
- `specs/rust-vcs/spec.md`: ADDED "Stacked approvals folder".
- `specs/rust-plan/spec.md`: MODIFIED "Next change number". It keeps "Next change numbers" and adds "Next change number across worktrees" and "Next change number with vcs off".

The three tasks share no file. Task 3 calls what tasks 1 and 2 add, so it runs after both.
