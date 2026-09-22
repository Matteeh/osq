---
planner: null
date: 2026-09-22
---

## Goal

Make `tests/harness-process.test.ts` deterministic under a full `pnpm verify`.
Behaviour of `spawnWithTimeout` does not change.

## What you can rely on

- The failing case is `spawnWithTimeout forces SIGKILL after 5000ms grace period if SIGTERM fails to terminate`. It enables `mock.timers` for `setTimeout`, spawns a real child with `process.execPath -e <script>`, and the script writes `READY` before registering `process.on('SIGTERM', ...)`. The real `SIGTERM` can therefore arrive before the handler exists, causing the child to terminate with `SIGTERM` instead of `SIGKILL`.
- `spawnWithTimeout` in `src/harness/process.ts` already accepts `killGracePeriodMs`, defaults it through `DEFAULT_KILL_GRACE_PERIOD_MS = 5000`, and returns `timedOut` and `signal`. Runtime code does not need to change.

## The fix

- Register the child `SIGTERM` handler before writing `READY`.
- Remove `mock.timers` from that test. Use `timeoutSeconds: 1`, a short `killGracePeriodMs` around 100, await the real result, and assert `timedOut === true` and `signal === 'SIGKILL'` without asserting elapsed time.
- Keep `assert.equal(DEFAULT_KILL_GRACE_PERIOD_MS, 5000)` as its own one-line test.

## Non-goals

- Changing runtime code, the default grace period, or `timeouts.harnessKillGracePeriodMs`.
- Touching unrelated cases in the test file.

## Task

One task scoped only to `tests/harness-process.test.ts`, with `tests.modify: true`. Its verify runs that file three times sequentially and fails on the first non-zero exit, then runs the import-graph and line-budget tests. It writes the watcher-and-harness capability under `Harness adapters and process execution`, stating that kill-grace coverage asserts the terminating signal rather than wall-clock time.
