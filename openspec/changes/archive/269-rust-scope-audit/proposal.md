---
title: Rust core decides which changed paths a task's scope allows
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-specs]
---
## Goal

The run feature must kill a task that writes outside its scope or changes a
frozen test. That decision is pure, so it belongs in core, where the run
feature and the scheduler can share it. This change adds `audit_scope` to
`osq-core`. Given a task's scope, its `tests.modify`, its change folder, the
test folders, the lock-file rules and the changed paths, it gives each
disallowed path and its reason, as TypeScript's git guard and frozen-test gate
decide.

Core cannot call the specs kernel, so the one glob matcher moves from the
specs kernel to core, and the specs kernel's `scope_covers_path` calls it.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic lints
and every Rust test, the corpus link gates included. It proves the new audit
tests pass and that the specs kernel's scope glob tests and every caller still
pass through the moved matcher.

## Non-goals

- Reading git status or the tree; the caller passes the changed paths.
- Test modules inside source files, such as Rust `#[cfg(test)]` modules.
- Dead markers, events and their messages.
- Language presets in core; the caller passes the test folders and lock rules.

## Surface

None

## Decisions

- ADR 017: core holds no language knowledge; the test folders and the manifest and lock-file names come in as data from the languages side.
- ADR 022: core stays the lowest layer; the specs kernel now depends on core's matcher, never the other way round.
- ADR 023: `audit_scope` and the matcher are pure leaves with one-line docs on private items.
- ADR 024: every public item ends its doc with `Implements: rust-core/<requirement>`, the specs kernel's function keeps `Implements: rust-specs/scope-globs`, and each test names `Covers: rust-core/<scenario>`.
- ADR 025: paths are the project-relative POSIX paths osq writes today.
- ADR 026: the specs kernel keeps its public `scope_covers_path`, so OpenSpec code calls it as before.
- ADR 027: the scheduler can call `scope_covers_path` from core.
- ADR 028: no `Feature` changes.
- ADR 029: no config is read.

## Assumptions

- An `Added` path is one TypeScript's git guard sees as untracked and new since the spawn; only one under the root `tests` folder is let through without scope, as `isNewUntrackedTest` does.
- A path the scope covers counts as authorized for a frozen test, as TypeScript's resolved scope of existing files gives for a path that existed before the task.
- A path outside scope that is also a frozen test gets both reasons, as TypeScript records both a scope violation and an undeclared test change.

## Contract

### Requirement: Scope audit

See `specs/rust-core/spec.md`, with "Scope coverage" and "Scope audit rules",
and `specs/rust-specs/spec.md` for "Scope globs".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-core/spec.md`: ADDED "Scope coverage", "Scope audit" and "Scope audit rules".
- `specs/rust-specs/spec.md`: MODIFIED "Scope globs", which now calls core's matcher and keeps its scenario.
