---
title: The land feature lands one archived change onto the default branch from its verified tree, as osq land does without stacks
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: ["rust-core", "rust-vcs", "rust-config", "rust-specs"]
---
## Goal

Rust can approve and archive a change but cannot land it, so a Rust run
cannot finish one. `crates/features/land` is a placeholder. This change
gives it `land <id>`, which finds the archived change in its osq worktree
as `changeTrees` does, refuses as TypeScript's `landChange` does, and
writes the branch tip's tree onto the default branch as one commit with
TypeScript's message and trailers. It then fast-forwards the checkout to
that commit and prints the changed paths.

Task 1 gives the storage kernel the facts a land reads from a change
folder. Task 2 builds the feature with its settings, lookup, message,
commit and fast-forward stops. Task 3 adds the refusals that must run
before a land: a stacked change, the checkout off the default branch, an
unclean worktree, and an earlier unlanded change on a shared capability.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test with
the corpus tests, and the mutation check on the lines this change touches.
That covers the storage tests on folders written under
`CARGO_TARGET_TMPDIR` and the land tests on scratch git repositories with
a worktree per change. One land test compares the commit message with the
one TypeScript's `buildSquashMessage` wrote for the same folder.

## Non-goals

- Stacked changes and the bridge commit: a change whose `.run/stacked-on` names any change is refused.
- Sync with a newer default branch: when `main` moved since the branch was cut, land stops with TypeScript's moved message instead of merging.
- Pushing to origin, the after-land command, removing worktrees, and the stops a land records on the change's branch.
- The steering refusal (`assertNoSteering`) and steering stops.
- The `--allow-stale` flag, the rebuild notice, and CLI wiring.

## Surface

None

## Decisions

- ADR 022: `osq-feature-land` depends only on `osq-core`, `osq-kernel-config`, `osq-kernel-storage` and `osq-kernel-vcs`. It reads change folders only through storage's `list_changes` and the new `read_land_facts`, and git only through the vcs kernel's `Vcs` port on `GitVcs`. It writes only the land commit and the checkout's fast-forward, and appends no event.
- ADR 023: the folder match, the message, the refusal texts and the earlier-change comparison are pure private functions over plain values; `LandFeature::run` and one orchestrator alone do IO.
- ADR 024: every public function's doc, and every function that implements a requirement, ends with `Implements: rust-land/<requirement>` or `Implements: rust-storage/land-facts`, and every test names `Covers: <capability>/<scenario>`.
- ADR 025: land reads today's archived folders, `.run` files and event JSONL as TypeScript writes them, and `osq.toml` in place of `osq.config.ts`.
- ADR 026: land parses no OpenSpec document itself; `tasks.md` is read through storage, which uses the specs kernel's `parse_task_list`, and the Node `openspec` CLI never runs.
- ADR 027: land lands one change per run and decides nothing about scheduling.
- ADR 028: the crate's one public item is `LandFeature`, a unit struct implementing `Feature` with the name `land` and one command `land`.
- ADR 029: land reads `vcs.enabled`, `vcs.author`, `vcs.defaultBranch` and `vcs.manualEdits` only through `load_config`.

## Assumptions

- The brief says the caller gives the checkout, the change's branch and the author because Rust could not read worktrees or `osq.toml`. Since 252, the config kernel reads `osq.toml`, and the vcs kernel's `worktree_list` names each `osq/<folder>` worktree, as TypeScript's `changeTrees` uses it. So `land <id>` takes only the id. The invocation's root is the checkout, and the author comes from `vcs.author`. With no `osq.toml`, `vcs.enabled` is false and land refuses, as TypeScript does under `DEFAULT_CONFIG`.
- The brief's "not clean" is read as TypeScript has it: a refusal when the change's worktree has any status entry, and the fast-forward stop for uncommitted checkout files the land writes. Other uncommitted checkout files do not refuse.
- A stacked change is refused with a Rust-only message instead of TypeScript's awaited-dependency check. A change that has already landed but still has its worktree gets a Rust-only line, because land removes no worktree yet.
- Land prints each changed path as a `Changed <absolute path>` line. TypeScript's `landChange` returns these paths in its `changed` field without printing them.
- `archived_at` accepts only the 24-character ISO form that storage's `timestamp_ms` reads, while TypeScript's `Date.parse` accepts more. osq always writes that form.
- `.stacked/` roots, which TypeScript's `changeTrees` also lists, are not read, since stacks are a later item.
- `golden/message.txt` was written by TypeScript's `buildSquashMessage` from `dist/`, on a scratch repository whose worktree branch held `fixture/001-alpha-orders`, with the `Osq-Head` value replaced by `<head>`. On that repository TypeScript's `landChange` also gave the off-branch, unclean-worktree, uncommitted-file, success and already-landed texts the deltas expect, and the changed paths in their order. The bare-folder message was checked the same way. The other refusal texts follow `landChange`'s code.
- `Cargo.lock` is shared with every other change that adds a crate dependency. Only task 2 scopes it.

## Contract

### Requirement: Land facts

See `specs/rust-storage/spec.md`.

### Requirement: Land feature

See `specs/rust-land/spec.md`.

### Requirement: Land arguments

See `specs/rust-land/spec.md`.

### Requirement: Land settings

See `specs/rust-land/spec.md`.

### Requirement: Land lookup

See `specs/rust-land/spec.md`.

### Requirement: Land message

See `specs/rust-land/spec.md`.

### Requirement: Land commit

See `specs/rust-land/spec.md`.

### Requirement: Land refusals

See `specs/rust-land/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-storage/spec.md`: ADDED "Land facts".
- `specs/rust-land/spec.md`: ADDED "Land feature", "Land arguments", "Land settings", "Land lookup", "Land message", "Land commit" and "Land refusals".

The change folder holds the inputs tasks 1 and 2 copy byte for byte:
`fixture/001-alpha-orders/` is the archived change folder of the fixture
change, and `golden/message.txt` is TypeScript's squash message for it.

Tasks 2 and 3 share `crates/features/land/src/land.rs`, which task 3
extends with the refusals, and `crates/features/land/src/land/checks.rs`,
which task 3 creates inside task 2's `src/land/*.rs` glob; task 3 runs
after task 2. Task 3 uses task 2's `tests/support/mod.rs` and fixtures
without changing them, and its test `tests/refusals.rs` stays outside
task 2's `tests/land_*.rs` glob.
