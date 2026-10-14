---
title: A task that hits the model's usage limit waits for the reset instead of failing
depends_on: []
verify: pnpm verify
features:
  reads:
    - spec-lint-and-approve
    - version-control
---
## Goal

When an executor stops because the account hit its usage limit, osq today
records whatever the run looks like, most likely `crashed` or `no_result`. That
uses up an attempt and can halt the change. With this change, the adapter
recognises the limit and writes a `usage_limit` event. The watcher then pauses
instead of judging the attempt. It writes `.run/paused.md`, appends a `paused`
event, and starts no task and no automatic planner on any change until the
reset time. Without a reset time it waits `gates.usageLimitWaitSeconds`. After
that, the same task runs again with the attempt number it had.

A pause halts nothing and needs nothing from the human. The change's next step
stays `running` and reads `running (paused until <time>)` in `osq show` and
`osq status`. The inbox lists the task under Running as
`paused until <time>`. `osq query` gains a `pauses` table to count pauses.

What each harness prints was measured on 2026-10-14:

- Claude Code 2.1.278 (stream-json, subscription login): a
  `rate_limit_event` whose `rate_limit_info.status` is `rejected`, with
  `resetsAt` in epoch seconds. `tests/fixtures/claude/run.jsonl` already holds
  the `allowed` form of this record.
- OpenCode v2.0.18: a JSON `error` event whose `error.type` is
  `provider.quota`. The binary maps `QuotaExceeded` to it as a
  non-retryable error and gives no reset time.
- Codex 0.155.1: `turn.failed` with a message holding `hit your usage limit`.
  The binary writes the apostrophe in `You’ve` as a curly quote, so the match
  leaves it out. The `Try again at` time is formatted local text, so osq does
  not parse it and waits the configured time.
- Pi 0.87.0 and Antigravity: no usage-limit record was found, so their
  adapters report nothing new.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test and lint on the final tree. That
includes the new `tests/usage-limit-events.test.ts`,
`tests/usage-pause-marker.test.ts`, `tests/usage-pause-watcher.test.ts`,
`tests/usage-pause-next-step.test.ts`,
`tests/usage-pause-inbox.test.ts`, `tests/ui-home-paused.test.tsx` and
`tests/query-pauses.test.ts`, plus the function and line budget tests over the
changed modules.

## Non-goals

- Switching to another model or account during the pause.
- Notifying anyone. A pause is not a failure.
- Showing the pause on the phone Change page. It reaches that page through the
  next step once `change-page-phone` and this change have both landed.
- Usage limits under Pi and Antigravity, and Codex's own reset time.
- The validator at archive. When it hits the limit, it fails as it does today.
- Leaving paused runs out of the attempt counts that `osq report` and the
  `tasks` and `task_outcomes` query tables show. A paused run counts as one
  there; `pauses` lists them.
- Pausing the automatic planner when its own run hits the limit. During a
  task's pause the watcher starts no planner, but a planner run that hits the
  limit records `failed` as today. Queued as `planner-usage-limit`, to be
  designed together with planning sessions run outside osq.

## Surface

- Added: `usage_limit` (task event type, written by the Claude, OpenCode and Codex adapters)
- Added: `paused` (task event type, written by the watcher)
- Added: `.run/paused.md` (marker file the watcher writes in a change folder)
- Added: `gates.usageLimitWaitSeconds` (config key, default `1800`)
- Changed: next step detail `paused until <YYYY-MM-DD HH:MM> UTC` for a `running` change
- Added: inbox running item field `pausedUntil`; a paused item has no `pid`, `startedAt` or `elapsedSeconds`
- Added: `pauses(change, task, paused_at, until, source)` (`osq query` table)

## Decisions

- ADR 001: `gates.usageLimitWaitSeconds` loads through the existing config loader and gates validator.
- ADR 002: archive and delta application are not touched.
- ADR 004: the OpenSpec validator is not touched.
- ADR 005: the OpenSpec peer range is not touched.
- ADR 008: `pauses` is built from the event files on every `osq query` call and stored nowhere.
- ADR 010: the validator is not touched; it does not pause.
- ADR 012: during a pause no task runs, so the supervisor may restart the watcher; the pause lives in `.run/paused.md` and survives that.
- ADR 013: the dashboard's home row only renders the new field; no write path changes.
- ADR 015: `osq mcp` is not touched; its inbox tool returns the new field as it returns the rest of the inbox.
- ADR 018: the watcher starts no automatic planner while a pause holds; a planner run that hits the limit is unchanged.

## Assumptions

- A run that holds a `usage_limit` event ended because of that limit, whatever its exit code. Claude Code's `rejected` status and OpenCode's `provider.quota` are not retried by the harness, and Codex's message comes with `turn.failed`.
- OpenCode's `error` event looks like `{"type":"error","timestamp":…,"sessionID":…,"error":{"type":"provider.quota","message":…}}`, as a live `provider.no-route` error looked on 2026-10-14. No real quota error was captured.
- `gates.usageLimitWaitSeconds` defaults to 1800 seconds. When the limit still holds after that wait, the rerun pauses again at the cost of one short spawn.
- A pause in a worktree throws away what the agent wrote before the limit, so the rerun starts from the last verified commit. In the checkout without version control, the edits stay, as they do for a dead task.
- No golden event fixture changes. Neither the verified flow nor the dead flow emits the new events, and no existing event gains a key.
- Existing tests that pin the full `osq query` table list need the `pauses` line: `tests/query-command.test.ts`, `tests/query-trial-tables.test.ts` and `tests/query-tables.test.ts`. Task 6 sets `tests.modify` for them.

## Contract

The watcher-and-harness, cli-foundation, status-inspection, web-inspection and
metrics-and-reporting deltas below are the contract.

## Human steps

### Before approval

None

### After landing

- Restart the watcher so it runs the new build; it reads its code and `osq.config.ts` once at start.
- Update the Notion roadmap: usage-limit pause landed.

## Delta

- `specs/watcher-and-harness/spec.md`: ADDED "Usage limit events" (task 1), "Usage pause marker" (task 2), "Usage limit pause" and "Usage limit wait across changes" (task 3).
- `specs/cli-foundation/spec.md`: ADDED "Usage limit wait key" (task 2).
- `specs/status-inspection/spec.md`: MODIFIED "Next step detail and format" (task 4); MODIFIED "Stable inbox object" and ADDED "Paused task in the inbox" (task 5).
- `specs/web-inspection/spec.md`: MODIFIED "Dashboard home" (task 5).
- `specs/metrics-and-reporting/spec.md`: ADDED "Pause query table" and MODIFIED "Task outcome query table" (task 6).

Every file belongs to one task. Task 1 adds both event types to
`src/harness/types.ts`. Task 2's `src/core/run/usage-pause.ts` is read by
tasks 3 to 6 without being edited.
