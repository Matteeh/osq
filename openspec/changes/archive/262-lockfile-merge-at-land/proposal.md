---
title: osq land rebuilds a lockfile both sides changed instead of stopping on a conflict
depends_on: []
verify: pnpm verify
features:
  reads: ["cli-foundation", "spec-lint-and-approve", "status-inspection"]
---
## Goal

Two parallel changes that each add a crate dependency both change `Cargo.lock`. When the second one syncs with the default branch at land, the merge conflicts in a file no human wrote, and the sync stops with `sync_conflict`. Planners scope `Cargo.lock` to avoid that, which makes the scheduler treat those changes as overlapping, so they run one at a time.

After this change the sync resolves a conflict that is only in a lock file the way it resolves living specs: it takes the default branch's copy and rebuilds it offline with the language's own command, so the change's manifests decide the result. Any other conflict still stops as today. Since 235 a task whose scope holds a manifest may already change that lockfile, so planners can leave `Cargo.lock` out of scope and such changes can run side by side.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new tests build scratch git repositories holding a small Cargo workspace whose crates have only path dependencies, so `cargo` needs no network, and run `syncWithDefaultBranch` on an active change for a clean rebuild, a lock file beside a code conflict, and a rebuild that fails.

## Non-goals

- Lock files of other package managers. Only `Cargo.lock` has a rebuild command; the others still stop on a conflict.
- Resolving conflicts in manifests themselves.
- Changing the scope check, the scheduler's overlap rule or planner guidance; 235 already lets a manifest's task change its lockfile.

## Surface

- Changed: `osq land` (command) and `osq sync` merge a conflict only in `Cargo.lock` by rebuilding it, instead of stopping with `sync_conflict`.
- Added: the `sync_failed` stop message `<folder>: rebuilding <lock file> failed on osq/<folder> merged with <default branch>:`.

## Decisions

- ADR 021: autopilot lands through the same sync, so it gets the rebuild with no change of its own.

## Assumptions

- `cargo update --workspace --offline` rebuilds `Cargo.lock` from the merged manifests, starting from the default branch's copy. It keeps every pinned version that still fits and adds only the entries the change needs. I checked this by hand on 2026-10-21 with two branches that each add a path-dependency crate under `crates/*`: the merge conflicted only in `Cargo.lock`, and the rebuilt file passed `cargo metadata --offline --locked`.
- The sync's existing verify run checks the rebuilt lockfile. For an archived change that is the proposal's `verify`; for an active change it is the done tasks' `verify`.
- `cargo` is on the `PATH` the watcher and the test run see. The prepare role's environment carries `PATH` and `HOME`, and the Rust verify already needs `cargo`.
- `src/core/vcs/sync-main.ts` is at 247 of the 250 lines `tests/line-budget.test.ts` allows. The conflict filter `blockedConflicts` therefore moves into the new `src/core/vcs/sync-lockfiles.ts` next to the rebuild, and `sync-main.ts` only calls them.
- Tests prove the scenarios with `node:test` titles, as the existing sync tests do.

## Contract

### Requirement: Default branch sync

See `specs/version-control/spec.md`.

### Requirement: Lock file rebuild command

See `specs/languages/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/languages/spec.md`: ADDED "Lock file rebuild command".
- `specs/version-control/spec.md`: MODIFIED "Default branch sync". Steps 2 and 3 resolve a lock file conflict by rebuilding it. The requirement keeps its seventeen scenarios and adds "Both add a crate to one Cargo workspace", "Lock file and code conflict" and "Lock file that cannot be rebuilt".

The two tasks share no file. Task 2 imports the function task 1 adds, so it runs after task 1.
