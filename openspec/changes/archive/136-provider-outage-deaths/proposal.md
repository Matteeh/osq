---
title: A provider outage is not a task failure
depends_on: []
verify: pnpm verify
features:
  reads:
    - spec-lint-and-approve
---
## Goal

When a task dies because its model provider never answered, osq records it as
`provider_unavailable` with the provider's error, stops the task once the
provider has stalled past a configured limit instead of waiting out the whole
task timeout, and retries it later on its own budget without ever marking it
stuck.

On 2026-10-01, 135 task 1 died twice with `timeout` during a DeepSeek outage,
and the stuck rule then asked for a re-plan of a plan that was fine. With this
change the first death reads `provider_unavailable`, ends about 10 minutes
sooner, and is retried by itself once the wait has passed.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint.
`tests/provider-outage.test.ts` proves the classification, the marker and the
early stop through the watcher's task spawn. `tests/provider-retry.test.ts`
proves the wait, the separate budget and the stuck exemption through the
watcher's automatic retry.

## Non-goals

- Teaching the claude, codex, opencode or agy adapters to report provider
  errors. Only pi's adapter writes `harness_retry` today, so only pi tasks get
  the new reason.
- Pausing the task timeout while a provider retry runs.
- Switching provider or model automatically.
- Any change to the `osq report` or `osq query` code. Both already group dead
  attempts by the reason the dead event carries, so the new reason shows up as
  its own row.

## Surface

- Added: `provider_unavailable` (dead reason), with the marker body `The model provider did not answer: <error>`
- Added: `gates.providerStallSeconds`, default 300 (config key)
- Added: `gates.providerRetries`, default 3 (config key)
- Added: `gates.providerRetryDelaySeconds`, default 300 (config key)
- Changed: the watcher stops a task whose harness has stayed in a provider retry longer than `gates.providerStallSeconds`

## Decisions

- ADR 001: unaffected; the new keys load through the existing config path.
- ADR 002: unaffected; archive applies the new deltas like any other.
- ADR 004: unaffected; the change does not run the OpenSpec validator.
- ADR 005: unaffected; the change does not check the validator version.

## Contract

### Requirement: Provider outages are their own dead reason

A task whose harness is still in a provider retry when its agent ends SHALL die
as `provider_unavailable`, SHALL be stopped once that retry has lasted
`gates.providerStallSeconds`, and SHALL be retried automatically after
`gates.providerRetryDelaySeconds`, up to `gates.providerRetries` times, without
being marked stuck.

#### Scenario: The 135 outage
- **WHEN** a task's harness records a `harness_retry` start with DeepSeek's error and no successful end before the agent is killed
- **THEN** the task dies as `provider_unavailable`, its marker quotes the error, and it is retried after the wait instead of being marked stuck

#### Scenario: Provider recovered
- **WHEN** the provider recovers, the agent works, and the task then hits its timeout
- **THEN** the task dies as `timeout`, as before

## Human steps

### Before approval

None

### After landing

- Run `pnpm build` and restart `osq watch` so the watcher uses the new reason.

## Delta

- `specs/watcher-and-harness/spec.md`: adds "Provider outage deaths", "Provider stall stop" and "Provider outage retries"; modifies "Stuck task detection".
- `specs/cli-foundation/spec.md`: adds "Provider outage gate keys".

Two tasks, in order. Task 1 classifies the death, writes the marker, stops a
stalled task, and adds the three gate keys. Task 2 retries provider deaths
and documents the whole change in README. No file is shared between tasks.

## Background

**What 135's stream shows.** Task 1's `.run/events/1.jsonl` for the first
death: `started`, a `tokens` event with every count 0, a `harness_retry`
start carrying DeepSeek's "We were unable to start processing your request
within the 900-second timeout limit" error, then `exited` with
`timedOut: true` 15 minutes later. The second death had a `harness_retry` end
with `success: true` ten minutes in, five tool calls, then the timeout. A
prototype classifier run over that file gives `provider_unavailable` for the
first death and nothing for the second and for the successful run, so the
second stays `timeout`. Its fingerprint then differs from the first, which
alone would have kept the stuck rule from firing.

**The rule.** An attempt's events start at its last `started` event. The
attempt is a provider outage when it holds a `harness_retry` start with no
later `harness_retry` end with `success: true`. A zero-token `tokens` event
alone is not enough, because some adapters only report tokens at the end, so
a real timeout there would look the same.

**The early stop.** Pi only writes `harness_retry` after the provider's own
first wait ends (900 s here), so the stall limit runs from that event. With the
default of 300 s, the first 135 death would have ended at about 20 minutes
instead of 30. The check runs on a timer inside the watcher's spawn guard,
which knows the agent's pid, and stops the agent with SIGTERM, the same signal
the task timeout uses.

**Why its own retry budget.** With `gates.autoRetries` at its default of 1, a
provider death would use up the one automatic retry and then wait for a human,
which is the friction this change removes. Provider retries count separately,
by the `reason` the `retry` event already carries, and never use up
`gates.autoRetries`. `gates.autoRetries: 0` still turns every automatic retry
off. A provider retry costs no tokens while the provider is down, and the
wait keeps it from hammering one.

**Line budgets measured in a prototype.** `src/watcher/spawn.ts` is on the
runner-lifecycle budget in `tests/import-graph.test.ts` (under 200 lines) and
was at 198, so the dead-marker text moves into the new
`src/watcher/provider-outage.ts` and `spawn.ts` ends at about 192.
`src/watcher/auto-retry.ts` was at 229 and the provider decision would push it
past 250, so it lives in the new `src/watcher/provider-retry.ts`.
`src/core/foundation/config.ts` is at 249 lines, so the keys live in the gates
block, `src/core/foundation/config-gates.ts`. The stall timer is a
`setTimeout` chain, because `tests/watcher-heartbeat.test.ts` expects exactly
one `setInterval` while a task runs.

**Measured fallout.** In a scratch worktree with the whole prototype, both
typechecks, lint and the full suite passed except the tests that need a build
(`bin-execution`, `package-*`, `web-export`). No existing test needs to change.

**Other harnesses.** No other adapter translates a retry or provider-error
record today. Whether Claude Code, Codex, opencode or agy emit one was not
checked; a later change can translate one into `harness_retry` and get this
behaviour for free.
