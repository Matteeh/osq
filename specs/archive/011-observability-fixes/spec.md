---
title: Observability fixes
depends_on: [010]
features:
  reads: [watcher-and-harness, metrics-and-reporting]
  writes: [watcher-and-harness, metrics-and-reporting]
---
## Goal

Fix critical defects in watcher observability, result synthesis, lifecycle tracking, lock collision reporting, token accounting, and harness helper duplication identified in code review of 009 and 010 at commit aeeaf48.

1. Propagate child process PID and elapsed duration from `spawnWithTimeout` through `AgyAdapter` and `OpencodeAdapter` into `SpawnResult`, logging the true PID on task start and attaching PID to lifecycle events instead of `pid: unknown`.
2. Eliminate duplicate lifecycle events by transferring sole ownership of `started` and `exited` events to the runner. The runner writes `started` via an `onSpawn(pid)` callback when the child process starts, and adapters stop emitting lifecycle events.
3. Activate result synthesis by introducing a first-class `text` harness event carrying the final assistant message emitted by both adapters, and simplifying runner synthesis to read solely from `text` events.
4. Prevent lock collisions (`already_running`) from appending spurious `dead` events to `.run/events/<n>.jsonl` when no dead marker file exists, ensuring only a dead marker write can record a `dead` event.
5. Extract reasoning tokens in adapters (`extractOpencodeTokens`, `extractAgyTokens`) and prefer the adapter's reported `cachedTokens` in `report.ts` over the remainder calculation, using remainder derivation strictly when no cache counter is reported.
6. Extract duplicate helper routines (`asRecord`, `firstNonEmptyString`, timestamp resolution, `EventStreamParser`) into a shared harness module, and remove deprecated backward-compatibility aliases from `MetricsReport`.

## Invariant

No test for a plumbing task may satisfy its acceptance using a mock adapter. Tasks 1, 2, and 3 must include a test that runs the real adapter against a fake harness binary and asserts on the resulting `events.jsonl`. A mock-only test is a verify failure for those tasks.
The runner alone owns lifecycle events (`started`, `exited`) and outcome markers (`done`, `dead`). Adapters translate stream events (`tokens`, `tool`, `text`) and must never emit lifecycle or marker events.
Only a dead marker write (`.run/dead/<n>.md`) may append a `dead` event to `.run/events/<n>.jsonl`.
Result synthesis reads exclusively from `text` events carrying the final assistant message.

## Contract

| Component / Event | Expected Output / Behavior |
|---|---|
| Process lifecycle & PID | Runner passes `onSpawn(pid)` to `adapter.spawn`; `spawnWithTimeout` invokes `onSpawn(pid)` upon spawn; runner appends single `started` event with PID and logs `task <n> started (pid: <pid>, timeout: <timeout>s)`; on exit runner appends single `exited` event with PID, exitCode, elapsedSeconds; adapters return `pid` and `elapsedMs` and emit neither `started` nor `exited` |
| Text event & Result synthesis | `HarnessEventType` includes `text`; adapters emit `{ type: 'text', data: { text } }` carrying final assistant message; runner `extractFinalTextFromStream` reads exclusively from `text` events and returns last message; candidate list in runner dropped |
| Lock collision (`already_running`) | When lock acquisition fails, runner logs outcome and returns failure without writing `.run/dead/<n>.md` and without appending `dead` event to `.run/events/<n>.jsonl` |
| Token reasoning & Cache preference | Adapters extract `reasoningTokens` and emit on `tokens` event data; `report.ts` prefers adapter `cachedTokens` / `cached_input` / `cache_read_tokens` over remainder formula, using remainder derivation only when no cache field is present |
| Shared helpers & Type cleanup | `asRecord`, `firstNonEmptyString`, timestamp resolution, and `EventStreamParser` moved to shared harness module; deprecated aliases on `MetricsReport`, `TokenMetrics`, `FileChangeMetrics` removed |

## Non-goals

- Modifying folder hashing, lock acquisition primitives, or cryptographic approval logic.
- Streaming partial assistant text deltas into `events.jsonl`.
- Applying 009 and 010 delta instructions to `features/` (tracked as separate follow-up 012).
- Implementing `osq plan`, `osq archive`, `osq doctor`, or `osq lint`.

## Follow-up

Spec 012: The watcher's delta step previously appended raw delta instructions to `features/*.md` for both 009 and 010 rather than applied documentation. Reconcile feature documentation in follow-up spec 012.

## Delta

Update `features/watcher-and-harness.md` to replace the outdated event stream description with the authoritative list of nine harness events and explicit ownership:
- Runner owns: `started` (with PID and timeout via `onSpawn`), `exited` (with exitCode, PID, elapsedSeconds, timedOut), `result_written` (with path and synthesized flag), `verify_ran` (with command, exitCode, duration), `done` (when verify passes and done marker is written), and `dead` (emitted exclusively when a dead marker file is written).
- Adapters own: `tokens` (promptTokens, candidateTokens, totalTokens, cachedTokens, reasoningTokens, cost), `tool` (tool name and summary), and `text` (final assistant message).
Document the `onSpawn(pid)` callback contract on `SpawnTaskOptions` and `spawnWithTimeout`, and document that result synthesis reads exclusively from `text` events.

Update `features/metrics-and-reporting.md` to document the token metric derivation priority (preferring adapter-reported cache counters over remainder derivation, reserving remainder derivation strictly for events lacking cache fields), reasoning token propagation, and removal of deprecated compatibility aliases from `MetricsReport`.