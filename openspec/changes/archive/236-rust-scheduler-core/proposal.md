---
title: Core decides, as a pure rule, which approved changes may start now and why each other change waits
depends_on: ["233"]
verify: sh scripts/verify-rust.sh
check: node --import tsx --import ./tests/git-test-env.ts --test tests/rust-adrs.test.ts
features:
  reads: [cli-foundation, spec-lint-and-approve]
---
## Goal

ADR 027 says one pure function in `osq-core` decides which approved changes
may start, so the loop, the server and the UI board get the same answer from
the same input. This change adds that function.

`schedule(queue, running)` takes the queued changes in queue order, each with
its approval, its dependencies and whether each is done, and the files of its
approved task scopes, plus the changes now running. It returns one state per
change, `Ready`, `WaitingOn`, `BlockedBy` with the shared files or crate, or
`NeedsApproval`, and the changes to start now. `lock_unit` maps a path to what
it locks: the whole crate for `crates/core/` and each `crates/kernel/<name>/`,
the file itself everywhere else.

A table test covers every state and overlap rule, and property tests prove
the rule is deterministic, never starts two overlapping changes, and never
starts a change with an unmet dependency. ADR 027 names both tests in its
`checks`.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test and
the mutation check on the lines this change touches. The `check` runs
`tests/rust-adrs.test.ts`, which proves ADR 027 names the new tests and that
they exist.

## Non-goals

- Reading change folders, resolving globs or spawning anything; that is `rust-loop-schedule` and later features.
- Agent limits per role, hard caps per run and usage-limit pauses.
- Parallel tasks inside one change.
- Any change to the TypeScript watcher.

## Surface

None

## Decisions

- ADR 022: the scheduler lives in `osq-core`, does no IO and adds no dependency; `proptest` is already a dev-dependency.
- ADR 023: small named functions, a doc comment on every item, and each public function's doc ends with its `Implements:` line.
- ADR 024: the new tests tag their scenarios with `Covers:`, and ADR 027 names them in `checks`.
- ADR 025: no on-disk format changes; the scheduler takes plain values.
- ADR 026: no specs kernel code changes.
- ADR 027: this is its rule 1 and rule 2 as a function; a change overlapping one this call starts is `BlockedBy` it, so `Ready` and started are the same set.

## Assumptions

- The input `queue` holds only changes that are not running; a queued change whose id is also running is left out rather than reported, so the loop may pass every active change.
- `WaitingOn` names the first undone dependency in the order given, and `BlockedBy` names the first overlapping running change, then the first overlapping change started earlier in the same call.
- Paths are compared exactly as given; `rust-loop-schedule` passes resolved, project-relative POSIX paths.

## Contract

### Requirement: Lock units

See `specs/rust-core/spec.md`.

### Requirement: Change scheduling

See `specs/rust-core/spec.md`.

### Requirement: Schedule states

See `specs/rust-core/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-core/spec.md`: ADDED "Lock units", "Change scheduling" and "Schedule states"; MODIFIED "Rust rebuild decisions" (ADR 027's checks row, scenarios kept).

No file is shared between tasks.
