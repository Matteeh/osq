---
title: The Rust osq retry clears a dead or regressed task or change as TypeScript does
depends_on: ["271"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-storage, rust-specs]
---
## Goal

A human retries a task or a change after it dies or regresses. Rust has no
retry, so a Rust run can't be retried without TypeScript. This change gives
the empty retry feature its `retry <id> <task|change>` command. It refuses
what TypeScript's `retrySpec` refuses, with the same text, and before it
writes anything. Otherwise it keeps each cleared marker as numbered
history, appends the `retry` event the watcher reads, and prints
TypeScript's lines. The expected results come from TypeScript itself:
goldens printed by the built `dist` on a fixture project in this change
folder, which task 1 copies into the crate.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints and every Rust test, the link gates and the mutation check of the
changed lines included. It proves that the Rust retry leaves the same
`.run` tree and text as TypeScript on every golden row, and that
`osq-rs retry` dispatches through the registry, which already lists
`RetryFeature`.

## Non-goals

- Retrying an after-land command, and stale-lock recovery of a killed watcher.
- Changes in an osq worktree, a stacked approval or the archive, and the uncommitted-plan-edits check, which needs a worktree. Like Rust reject and run, retry reads the checkout's active changes only.
- Recertifying a scope regression: running the task's verify and refreshing its done marker. Rust refuses that one case and names the TypeScript command.
- The watcher's automatic retry and its `automatic` key.

## Surface

- Added: `osq-rs retry <id> <task|change>` (command).

## Decisions

- ADR 022: retry stays in its own feature crate and calls only the storage and specs kernels; the folder match is a copy of run's rule inside the retry crate, since a feature never calls another.
- ADR 023: the ordinal, reason and output text are pure functions; one orchestrator reads and renames the markers.
- ADR 024: every public item ends its doc with `Implements: rust-retry/<requirement>`, and each test names `Covers: rust-retry/<scenario>`.
- ADR 025: retry renames today's `.run` markers and appends the `retry` event TypeScript's `readRetryContext` reads.
- ADR 026: marker frontmatter is read through the specs kernel's `parse_frontmatter`.
- ADR 027: no scheduling changes.
- ADR 028: `RetryFeature` stays a unit struct and gains one `Command`.
- ADR 029: retry reads no config; with vcs off, TypeScript's retry needs none either.

## Assumptions

- A marker whose reason isn't a `FailureReason` is refused, because Rust's event types are strict, while TypeScript writes any text. Every reason TypeScript's watcher writes is one.
- A stale pid is one with no `/proc/<pid>`, which matches `process.kill(pid, 0)` (EPERM counts as alive) on Linux and WSL, the only platforms osq runs on.
- Event lines are compared as parsed JSON with the timestamp blanked, since rust-core writes keys in a different order than TypeScript; every reader parses them.
- Every golden was printed by `golden/print-goldens.mjs.txt` with the built `dist` of this repository on 2026-10-22.

## Contract

### Requirement: Retry record

See `specs/rust-retry/spec.md`, with "Retry command", "Retry arguments"
and "Retry refusals".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-retry/spec.md`: REMOVED "Retry feature"; ADDED "Retry command", "Retry arguments", "Retry refusals" and "Retry record".
- `fixture/retry-project/` holds the fixture project, and `golden/` the goldens, that task 1 copies to `crates/features/retry/tests/fixtures/`.
