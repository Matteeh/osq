---
title: The watcher syncs a change with the default branch before a retried attempt
depends_on: []
verify: pnpm verify
features:
  reads: [version-control, cli-foundation, spec-lint-and-approve, status-inspection]
---
## Goal

A change's worktree takes the default branch only before its first task
and before archive. A tooling fix that lands on main later, such as a
formatter config, a verify script or a toolchain pin, misses every
running change. On 2026-10-23, 305 task 2 died six times on a biome bug
already fixed on main. The only way to bring the fix in was a manual
`osq sync`, which raced the watcher and halted 305.

This change has the watcher take main itself before every attempt that
follows an earlier one, automatic or after `osq retry`. The watcher
already syncs before a change's first task through `checkSync`. It now
also syncs when the next task's attempt, as `readRetryContext` counts
it, is above 1. `syncWithDefaultBranch` already does nothing when the
default branch has not moved, so a retry with nothing new on main adds
no commit. A sync that stops halts the change just as the first-task
sync does, and no attempt starts.

## Verify

`pnpm verify` runs both typechecks, the build, every test and lint. It
proves, on a scratch repository with a scripted adapter, that an
automatic and a human retry of a later task each run on a tree that
holds a fix made on main after the first attempt, with `osq: <id> sync
main` between the dead commit and the verified one; that a conflicting
main halts the change with `sync_conflict` before the retry spawns; and
that every earlier watcher sync test still holds.

## Non-goals

- Syncing before every task, or while a task runs.
- Changing the sync itself.
- The Rust loop.

## Surface

None

## Decisions

- ADR 002: archive's delta merge is unchanged.
- ADR 010: the validator is unchanged.
- ADR 012: the sync runs inside the watcher's own cycle, between attempts, never while a task runs, so the supervisor's restart rule is unchanged.
- ADR 018: a sync stop before a retry gives the same steering triggers the first-task sync gives, and auto-steer treats them alike.
- ADR 019: tapped planners are unchanged.
- ADR 021: autopilot's recovery sees the same halts it sees from the first-task sync.

## Assumptions

- "An attempt after the first" is `readRetryContext`'s `attempt` above 1, the count the executor prompt already uses. That covers automatic retries, human retries and requeued recertifications. A task whose earlier attempt left no `retry` or requeued `recertification` event, such as one killed with its watcher before any retry, counts as a first attempt.
- A rough version of this change broke no existing test; the only failures in the measured run were the build-only tests that fail in any unbuilt worktree.

## Contract

### Requirement: Sync before a retried attempt

See `specs/watcher-and-harness/spec.md`, "Watcher sync", with "Sync
before a retried attempt" and "Sync stop before a retried attempt".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/watcher-and-harness/spec.md`: MODIFIED "Watcher sync", with two new scenarios; its six scenarios are unchanged.
- No file is shared by two tasks.
