---
title: Every failure path osq recovers from has a scenario test from failure to resumed run
depends_on: []
verify: pnpm verify
features:
  reads: [cli-foundation, status-inspection]
---
## Goal

Most osq bugs found in real runs since 141 sat in code that only runs after
something went wrong: the dead commit that overflowed git's buffer, `osq
approve` from a worktree, a main sync flagging a done task, the stuck
fingerprint, the stacked land conflict. 152 fixed the known ones, and its
tests cover each fix, not the whole path from failure to resumed run.

This change proves each recovery path end to end. Each test builds a
temporary git repository with `vcs.enabled` on and a fake executor, produces
the failure the way a real run does, recovers through the command functions
`osq approve`, `osq retry`, `osq land` and `osq watch --once` run, and ends
with the change landed on `main`. No test runs git by hand except to move
`main` the way another developer would.

Measured on 2026-10-11 in a scratch worktree, with a rough version of every
test: all seven paths already recover. One path has a rough edge, which this
change fixes. After a watcher is killed mid-task, `osq retry <id> <n>` says
`Task 1 is running; retry is refused.`, though nothing runs. It now says
the watcher stopped and that `osq watch` reaps the lock.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test (the new recovery tests
and the retry, lock, steering, sync and land tests that pin today's
behavior), and lint, on the final tree.

## Non-goals

- New recovery behavior beyond the retry refusal text.
- Real model runs or the real CLI binary; the tests call the command
  functions with a fake adapter.
- Changing the existing per-fix tests. The new tests sit next to them.
- A clearer refusal from `osq approve` on a halt that needs no steering. It
  already prints `osq retry <id> change` as the next step, which the new
  test pins.

## Surface

- Changed: `osq retry <id> <n>` refusal for a task whose running lock records a pid that no longer runs, now `Task <n> was left running by a stopped watcher (pid <pid>); run osq watch to reap it, then osq retry <id> <n> if it stays dead.`

## Decisions

- ADR 002: unchanged; the steered and restarted changes still merge their deltas only at archive.
- ADR 004: unchanged; approval in these tests runs the fake validator as every approval test does.
- ADR 005: unchanged; no validator version check is touched.
- ADR 010: unchanged; the tests install the fake validator as the land and steering tests do.
- ADR 012: the killed-watcher test kills a watcher process mid-task; the next watcher reaps the lock, as the service does after a crash.

## Assumptions

- `runWatcherOnce` is what `osq watch --once` runs, and `approveCommand`, `retryCommand` and `landCommand` are what `osq approve`, `osq retry` and `osq land` run, so calling them in-process with an injected adapter covers the same paths as the binary.
- The killed-watcher test starts a real `node` child that runs `runWatcherOnce` and kills it with `SIGKILL` once the executor wrote part of its file. It takes about one second on this machine.
- The retry refusal reads the lock's `pid` field and asks `isPidRunning` from `src/core/run/lock.ts`. It writes nothing and does not reap; reaping stays the watcher's.

## Contract

The watcher-and-harness, spec-lint-and-approve and version-control deltas
below are the contract.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/watcher-and-harness/spec.md`: ADDED "Task failures recover to a landed change", "Stopped watcher's lock at retry".
- `specs/spec-lint-and-approve/spec.md`: ADDED "Approval resumes a halted run".
- `specs/version-control/spec.md`: ADDED "Land stops recover to a landed change".

Task 1 owns `tests/recovery-support.ts`. Tasks 2 to 7 import it and never
edit it.
