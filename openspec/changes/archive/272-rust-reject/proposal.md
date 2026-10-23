---
title: The Rust osq reject moves a change into rejected history as TypeScript does
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core]
---
## Goal

A human rejects a plan, or a change that failed, with a reason. Rust's
approve feature approves but cannot reject. This change adds `reject <id>
--reason <text>` to the approve feature, the capability TypeScript's
`spec-lint-and-approve` also gives both commands. It ports `rejectSpec` for
a change in the checkout: the same refusals in the same order, the folder
moved into `openspec/changes/rejected/`, and the same `.run/rejected.md` and
`rejected` event, so TypeScript reads a Rust rejection as its own (ADR 025).

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic lints
and every Rust test, the link gates included. It proves the reject tests on
scratch change folders pass, and that the approve tests and goldens still do.

## Non-goals

- Changes that live in an osq worktree or a stacked approval, and the worktree commit TypeScript makes with `vcs.enabled`.
- Matching `commander`'s own argument error texts; Rust prints its usage errors.
- Replanning a rejected queue item.

## Surface

- Added: `osq-rs reject <id> --reason <text>` (command).

## Decisions

- ADR 022: reject lives in the approve feature's crate, as TypeScript keeps approve and reject in one capability; no new crate.
- ADR 023: argument reading, eligibility and the time format are pure functions; only the reject orchestrator touches files.
- ADR 024: every public item ends its doc with `Implements: rust-approve/<requirement>`, and each test names `Covers: rust-approve/<scenario>`.
- ADR 025: `.run/rejected.md` and the `rejected` line in `.run/events/change.jsonl` keep TypeScript's bytes and key order.
- ADR 026: no spec parsing changes.
- ADR 027: no scheduling changes.
- ADR 028: `ApproveFeature` gains a second `Command`; it stays a unit struct with no state.
- ADR 029: reject reads no config.

## Assumptions

- The expected refusal texts and outcomes were taken from TypeScript's `dist` `rejectSpec`, run on scratch folders for each row of "Reject outcomes".
- Like Rust approve today, reject reads only the checkout's active changes. With vcs on, a change running in a worktree is not found and nothing is written.
- `reject` checks eligibility from marker files, not the event fold `read_change` gives, because TypeScript's `assertRejectable` reads markers.

## Contract

### Requirement: Rejection record

See `specs/rust-approve/spec.md`, with "Approve feature", "Approve
arguments", "Reject arguments", "Reject refusals" and "Reject eligibility".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-approve/spec.md`: MODIFIED "Approve feature" and "Approve arguments"; ADDED "Reject arguments", "Reject refusals", "Reject eligibility" and "Rejection record".
