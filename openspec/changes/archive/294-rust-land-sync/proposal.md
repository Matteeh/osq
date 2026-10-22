---
title: Rust land merges a newer default branch into the change's branch before landing
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-config, rust-harnesses, rust-specs, rust-storage, rust-vcs]
---
## Goal

When the default branch moved after a change was approved, TypeScript
land first merges it into the change's branch, rebuilds conflicting
living specs and `Cargo.lock`, verifies the merged tree, and stops on a
code conflict. Rust land has no sync, so once main has moved it refuses
with "main moved while landing", which happens to almost every change
when several run in parallel. This change gives Rust land TypeScript's
sync for an archived change: the requirement check, the merge, the spec,
archive and lock file rebuilds, `vcs.prepare`, the proposal's verify and
check, the `synced` event and the sync commit. A conflict, a changed
requirement or a red verify stops the land and records TypeScript's
land-stop marker and event on the branch.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints and every Rust test, the link gates and the mutation check of the
changed lines included. It proves the sync on scratch land repositories:
a clean merge, a living spec conflict, an archive conflict, a
`Cargo.lock` conflict, a code conflict, a changed requirement, failed
rebuild, prepare and commit steps, a record that cannot commit, and the
verify and check outcomes, and that every earlier land test still passes.

## Non-goals

- The bridge commit for stacked changes; Rust land still refuses them.
- `osq sync` as its own command, and syncing an active change.
- The progress line `<default branch> has <n> new commits; merging into osq/<folder> ...`, which TypeScript writes to stderr; a Rust feature returns one text.
- A `limits` block in the Rust config; the tail sizes are TypeScript's defaults.

## Surface

None

## Decisions

- ADR 003: osq alone writes git here: the sync merge and commit and the stop record go only to `osq/<folder>` in the change's worktree; the checkout moves only by "Land commit"'s fast-forward.
- ADR 007: every command the sync runs, the lock rebuild, `vcs.prepare`, verify and check, goes through `run_verify`, so no model key reaches it.
- ADR 022: land calls only the core, config, harnesses, specs, storage and vcs kernels; the sync and the stop record live in the land crate and append rust-core's typed events.
- ADR 023: path classification, messages, the output tails and the log name are pure functions; one sync orchestrator holds the git and file IO.
- ADR 024: every public item ends its doc with `Implements: rust-land/<requirement>`, and each test names `Covers: rust-land/<scenario>`.
- ADR 025: the sync commit, the stop marker, the `synced`, `verify_ran` and `regressed` events and the verify logs are TypeScript's files and bytes.
- ADR 026: the requirement check and the delta apply use the specs kernel's `parse_delta`, `parse_living_spec` and `merge_change`, as archive does.
- ADR 027: no scheduling changes; changes still land one at a time.
- ADR 028: `LandFeature` stays a unit struct with its one command.
- ADR 029: `vcs.prepare`, `vcs.author` and `timeouts.verifyTimeoutSeconds` come from `Config`. The 20, 40 and 400 tail sizes are TypeScript's `limits` defaults, held as constants because the Rust config has no `limits` block yet.
- Departs from ADR 017: `Cargo.lock` and its rebuild command sit in the land crate as a table of one, because Rust has no languages kernel yet; they move there when one exists.

## Assumptions

- TypeScript's stop record commits `osq: <id> land stopped` on the branch, so "leaves the branch as it was" in the brief means the merge is aborted and the branch's files are as before, with that one record commit on top, as TypeScript does.
- Running the proposal's verify and check after the merge is part of "as TypeScript does": landing a merged tree no verify has seen would bypass osq's verification gate.
- Every lock file conflict test uses path-only crates, so `cargo update --workspace --offline` needs no registry; the failing rebuild uses a malformed `sub/Cargo.toml`, so cargo never walks up to this repository's workspace.
- The hook tests set `core.hooksPath` in the checkout's local config, so a global hooks path cannot change them.

## Contract

See `specs/rust-land/spec.md`: the ADDED "Land sync", "Land stop record" and "Land sync verify", and the MODIFIED "Land commit".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-land/spec.md`: MODIFIED "Land commit", which now runs after the sync and lets the sync's commands run, and whose "Land commit stops" scenario loses the row where `main` gained `other.txt`, because that land now syncs; ADDED "Land sync", "Land stop record" and "Land sync verify".
- Shared files: task 2 extends `crates/features/land/src/land/sync.rs` and files under `crates/features/land/src/land/sync/`, which task 1's scope `crates/features/land/src/**` owns; the watcher recertifies task 1 when its verify still passes.
