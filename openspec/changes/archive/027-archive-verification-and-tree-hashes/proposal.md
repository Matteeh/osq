---
title: "Archive-time verification and tree hashes"
depends_on: ['026']
verify: "pnpm tsc --noEmit && pnpm test && pnpm lint"
features:
  reads:
    - watcher-and-harness
    - spec-lint-and-approve
    - status-inspection
  writes:
    - watcher-and-harness
    - spec-lint-and-approve
---
## Goal

A change cannot archive with a task whose work is no longer in the tree or whose feature does not work through its real entry point.

The proposal gains a change-level `verify` command exercising the change through its real entry point (CLI commands, `osq watch` against fixtures, validator invocation; full suite for refactors). Spec linting rejects any proposal without one.

Before archiving, the archiver re-executes each task's `verify` command followed by the change-level `verify` command against the final tree under the runner's timeout and TTY-free environment. Any failure halts archiving, records `.run/regressed/<n>.md` (or `.run/regressed/change.md`), appends a `regressed` event, and halts the change exactly as a dead task does.

Task completion records frontmatter in `.run/done/<n>`: the post-task `Snapshot` hash of the task's scope, the build stamp, and the `verify_ran` exit code. Before spawning task n+1, the runner verifies every earlier done task's recorded scope hash against the current working tree. Any mismatch marks that earlier task `regressed` before spawning, recording differing paths in the marker.

The `verify_ran` event stream payload is updated to carry `exitCode` and `duration` across all verification invocations through a single code path. The golden event fixtures (`tests/fixtures/events/verified.jsonl` and `dead.jsonl`) are regenerated to reflect these fields.

## Contract

| Component / Trigger | Expected Output / Behavior |
|---|---|
| Proposal lint | `osq lint` rejects proposals lacking a non-empty frontmatter `verify` command |
| Task completion (`done/<n>`) | Marker written with frontmatter containing scope hash, build stamp, and verify exitCode |
| Pre-spawn check (task n+1) | Runner compares recorded scope hashes of all earlier done tasks against current tree; mismatch writes `.run/regressed/<n>.md`, appends `regressed` event, and halts before spawning |
| Verification gate execution | Single code path executes command, measures duration, captures exitCode/output, and emits `verify_ran` with `exitCode` and `duration` |
| Archive-time verification | Archiver re-runs all task verifies then change-level verify against final tree; failure blocks archive, writes `.run/regressed/<n>.md` or `change.md`, and appends `regressed` event |
| Status inspection | `osq status` and `deriveSpecState` report `regressed` for regressed tasks or changes |
| Golden fixtures | `tests/fixtures/events/verified.jsonl` and `dead.jsonl` regenerated with updated `verify_ran` payload |

## Non-goals

- Implementing automatic `osq retry` logic (manual deletion of the regression marker clears the state until retry command is introduced).
- Changing git staging or commit behavior during task execution.
- Allowing partial archiving or skipping failed task verifications.

## Human steps

Run this change's own task verifies and its change-level verify by hand before archiving it, and write the results in the archive commit message. This is the last change archived that way.

## Delta

This change adds change-level verify linting, done-marker scope hashes, pre-spawn regression detection, regressed status and lifecycle events, and archive-time verification re-runs to `watcher-and-harness` and `spec-lint-and-approve`.
