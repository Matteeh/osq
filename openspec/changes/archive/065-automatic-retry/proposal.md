---
title: Automatic retry
depends_on: ["064"]
verify: pnpm verify
features:
  reads:
    - watcher-and-harness
    - cli-foundation
    - status-inspection
    - metrics-and-reporting
---
## Goal

When a task dies for a reason a fresh attempt could fix, the watcher retries it
once without a human, and every retry's prompt says what went wrong. Each dead
marker gets a fingerprint. When a task dies with the same fingerprint as its
previous death, the watcher stops and the inbox shows the task as stuck. Every
automatic attempt is recorded, so `osq report` can show what automatic retries
fix and what they cost.

Since dead markers started being retained in 029, task 5 of 039, task 3 of 043,
task 3 of 053, and task 1 of 054 each died once and passed on attempt 2 with the
same model, after a human waited 4 to 21 minutes to run `osq retry`. Task 1 of
044 crashed three times in 17 minutes with byte-identical markers and passed on
attempt 4. After a retry today, the prompt names only the reason: `readRetryContext`
in `src/watcher/attempt.ts` clears output on every `retry` event, and only a
requeued recertification carries failure output.

How the watcher shares the transition: `retrySpec` in
`src/core/lifecycle/retry.ts` is the only transition. The watcher calls it with
`{ automatic: true }` after `runTask` has returned. By then the task lock
`.run/running/<n>.pid` has been released in `runTask`'s `finally`, so
`retrySpec`'s running check passes, and its approval check applies unchanged.
The decision runs every cycle from disk for each dead task in an approved
change, and renaming the active dead marker is the commit point, so a watcher
restart between a death and its retry neither loses nor repeats it.

Measured in a scratch worktree against the full suite: fingerprints in dead
markers, prior output after a retry, an automatic retry in the loop, and
`automatic: true` on automatic `retry` events break only the two lifecycle
line-budget tests (`outcome.ts` must stay under 200 lines),
`tests/retry-attempts.test.ts` (it pins a context without output), and
`tests/retry-watch.test.ts` (it expects a first death to stay dead).
`tests/retry.test.ts` and `tests/dead-marker-retention.test.ts` stay green.
The golden event fixtures do not change, because no golden run contains a
retry and manual retries do not carry `automatic`.

Roadmap item 1.5 has not been planned, so `verify_path_missing` does not exist
yet. The eligible reasons are one exported constant in
`src/watcher/auto-retry.ts`, and 1.5 adds its reason there.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests drive the real
watcher cycle with the mock harness and local verifiers. They prove that a
`verify_red` death that passes next time reaches done with one automatic
`retry`; that two identical deaths stop as stuck with no third attempt and show
as stuck in the inbox and `osq --json`; that outputs differing only in
timestamps, durations, PIDs, ANSI codes, or the project path share a
fingerprint; that `spec_conflict` and `verify_precondition` never retry
automatically; that a count of zero behaves as today; that the prompt after a
manual and after an automatic retry both contain the previous marker's body;
and that a restart between a death and its retry neither loses nor repeats it.

## Non-goals

- More than one automatic retry by default, per-change ceilings, or model
  escalation.
- Classifying flaky verifies or infrastructure failures.
- Asking a planner to amend the spec.
- Retrying regressions. Recertification owns them.
- Adding `verify_path_missing` before roadmap item 1.5 exists.

## Surface

- Added: `gates.autoRetries` (config key, default 1; 0 disables automatic retries and stuck marking)
- Added: `retry.data.automatic` (event field, present and true only on automatic retries)
- Added: `stuck` (event type with `task` and `fingerprint`)
- Added: `fingerprint` and `stuck` (dead marker frontmatter fields)
- Added: `stuck` on `task-dead` inbox items in `osq --json` (optional field; the kind is unchanged)
- Added: `Retries:` and `Stuck:` lines per task in `osq show`
- Added: `history.retries` and an `Automatic retries` section in `osq report`

## Contract

### Requirement: Automatic retry
When a task in an approved change is dead with an eligible reason and fewer
automatic retries than `gates.autoRetries` since the later of its approval and
its last manual retry, the watcher SHALL retry it through `retrySpec` with
`automatic: true` and print one line.

#### Scenario: Retry fixes the task
- **WHEN** a task dies with `verify_red` and passes on its next attempt
- **THEN** it reaches done with one automatic `retry` event and no human action

### Requirement: Stuck task detection
When a dead task's fingerprint equals its previous retained dead marker's, the
watcher SHALL NOT retry it automatically and SHALL mark it stuck once.

#### Scenario: Same failure twice
- **WHEN** a task dies twice with identical output
- **THEN** it gets no third attempt, and the inbox and `osq --json` show it as stuck

## Human steps

- Approve 065 only after 064 has archived; both change report files.
- Review the proposal, delta specs, and task bodies, then run
  `osq approve 065` yourself.

## Delta

- `specs/watcher-and-harness/spec.md`: adds "Automatic retry", "Dead marker
  fingerprint", and "Stuck task detection"; modifies "Preserving retry
  transition", "Retry attempt lifecycle events", and "Retried executor
  context".
- `specs/cli-foundation/spec.md`: modifies "Configuration loading and schema
  validation".
- `specs/status-inspection/spec.md`: adds "Stuck and automatic retry
  inspection"; modifies "Stable inbox object".
- `specs/metrics-and-reporting/spec.md`: adds "Automatic retry history".

No file is shared between tasks.
