---
title: The TypeScript watcher runs up to maxConcurrency independent approved changes at the same time
depends_on: ["233"]
verify: pnpm verify
features:
  reads: [rust-core, spec-lint-and-approve, status-inspection]
---
## Goal

The rest of the Rust rewrite should run in parallel lanes now, not after the
Rust loop exists. Today `runWatcherCycle` in `src/watcher/loop.ts` walks the
active changes one by one and awaits each change's task, often 10 to 30
minutes, before it looks at the next change. `maxConcurrency` is in
`OsqConfig` but nothing reads it.

Overlap is already decided at approve (change 170): a change whose delta
shares a capability with an approved or archived unlanded change stacks
behind it, so approved changes that are not stacked are independent. Each one
runs in its own worktree with its own branch, `.run/` markers and running
lock, and land stays one at a time.

This change gives each change's task its own lane. The watcher starts the next
task of up to `maxConcurrency` changes at once and leaves a change alone while
its lane runs. With `maxConcurrency: 1` tasks run in the same order as today.
Stopping the watcher, by abort, SIGINT or a build check, waits for every lane,
so the watch service still never restarts while a task runs (ADR 012).

Planning found that the cycle starts a stacked change's task inside its
stacked copy before the cut. Today that attempt fails harmlessly after the
base finishes; with lanes it would run beside its base. The cycle now starts
no task in a stacked tree.

osq's own config sets `maxConcurrency: 3`, and ADR 027's Status says
TypeScript osq runs independent approved changes in parallel until the Rust
loop replaces it.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test and lint. That covers the new
lane tests, the watcher tests that pin today's one-at-a-time behavior, the
own-config test and the Rust ADR test.

## Non-goals

- File-level or crate-lock overlap in TypeScript; that is the Rust scheduler's job.
- Parallel tasks inside one change.
- Parallel planning, parallel landing, or changes to autopilot.
- A live status row per lane; lanes share the one row.

## Surface

- Changed: `maxConcurrency` (config key) now caps how many approved changes run a task at once; it was unused.

## Decisions

- ADR 001: osq's own `maxConcurrency` is read through the jiti config loader like every other key.
- ADR 004: unchanged; the delta adds no validator call.
- ADR 005: unchanged; the delta adds no validator call.
- ADR 015: `osq mcp` is untouched; its tools still write only inside one unapproved change folder.
- ADR 002: archive still merges each change's deltas without a model; a lane archives only its own change.
- ADR 010: the validator still runs once per change at archive, inside that change's lane.
- ADR 012: the watcher exits for a new or stale build only after every lane has finished, so the service never restarts while a task runs.
- ADR 018: automatic steering still runs in the cycle, never inside a lane, and only while no pause is active.
- ADR 019: tapped planners are untouched; they run detached as before.
- ADR 021: the autopilot pass still runs after each cycle and moves one queue item at a time.

## Assumptions

- Only one watcher runs per project, so the lanes this watcher started are what runs; a running lock left by a stopped watcher is reaped as `crashed` at the next cycle, as today.
- git commits, sync merges and archive commits in separate worktrees can run at the same time; git's own lock files guard the shared refs.
- Each `osq land` runs `pnpm build`, so the service worker sees a new build while other lanes run; it starts nothing more and restarts once they finish.
- Each worktree builds its own Rust target, so three lanes cost about three times the CPU and tokens of one.

## Contract

### Requirement: Parallel change lanes

See `specs/watcher-and-harness/spec.md`.

### Requirement: What a lane runs

See `specs/watcher-and-harness/spec.md`.

### Requirement: Stopping waits for running lanes

See `specs/watcher-and-harness/spec.md`.

### Requirement: osq's own change concurrency

See `specs/cli-foundation/spec.md`.

## Human steps

### Before approval

None

### After landing

- If planning should no longer wait for each land, drop "One change at a time: land each before the next is planned." from the header of `openspec/queue.md`.

## Delta

- `specs/watcher-and-harness/spec.md`: ADDED "Parallel change lanes", "What a lane runs" and "Stopping waits for running lanes".
- `specs/cli-foundation/spec.md`: ADDED "osq's own change concurrency".

No file is shared between tasks.
