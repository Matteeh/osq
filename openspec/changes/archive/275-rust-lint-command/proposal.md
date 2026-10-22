---
title: The Rust osq lint reports a change's spec and link gate findings
depends_on: ["271"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-specs, rust-linter, rust-storage]
---
## Goal

The specs kernel validates a change's deltas and the linter kernel runs the
link gates, but no Rust command runs them on a change. This change gives
the empty lint feature its `lint <id>` command: it finds the active change
as approve does, runs `validate_change` (and `validate_merged_change` when
that is clean) and `change_link_gates` with the group `rust`, prints each
finding on its own line, and fails when there is any. The Rust gates can
then be run on a change before TypeScript's lint is ported in full.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic lints
and every Rust test, the link gates and the mutation check of the changed
lines included. It proves the lint tests on the fixture project and scratch
roots pass, and that `osq-rs lint` dispatches through the existing registry.

## Non-goals

- TypeScript's planner rules about proposals, tasks, scopes and verifies; later items port them.
- `--repository`, `--json`, several ids, or linting every change when no id is given.
- Changes that live in an osq worktree or a stacked approval; lint reads the checkout's active changes only, as Rust approve does.
- Printing each finding's fix.

## Surface

- Added: `osq-rs lint <id>` (command).

## Decisions

- ADR 022: lint stays in its own feature crate and calls only kernels; the folder lookup is a copy of approve's rule inside the lint crate, since a feature never calls another.
- ADR 023: the line and message formatting are pure functions; only the lint orchestrator reads files.
- ADR 024: every public item ends its doc with `Implements: rust-lint/<requirement>`, and each test names `Covers: rust-lint/<scenario>`; lint runs the same `change_link_gates` the repository's live gate runs.
- ADR 025: lint reads today's `openspec/` folders and writes nothing.
- ADR 026: delta validation and merge come from the specs kernel; no Node runs.
- ADR 027: no scheduling changes.
- ADR 028: `LintFeature` stays a unit struct and gains one `Command`.
- ADR 029: lint reads no config; the folders `decisions` and `openspec` and the group `rust` are fixed, as the live link gate test fixes them.

## Assumptions

- The findings print after a count line, `<folder>: <n> findings`, because a failing command's message is shown after `lint failed: ` on stderr; the brief put the count last.
- Every expected line in "Lint fixture changes" and "Lint check errors" was taken by running the specs and linter kernels on the fixture project in this folder and on scratch roots.
- The group `rust` is fixed: Rust lint is for this repository's Rust gates, and a capability with another sidecar group gets no `complete-capabilities` finding.

## Contract

### Requirement: Lint findings

See `specs/rust-lint/spec.md`, with "Lint command", "Lint arguments",
"Lint lookup" and "Lint errors".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-lint/spec.md`: REMOVED "Lint feature"; ADDED "Lint command", "Lint arguments", "Lint lookup", "Lint findings" and "Lint errors".
- `fixture/lint-project/` holds the fixture project task 1 copies to `crates/features/lint/tests/fixtures/lint-project/`.
