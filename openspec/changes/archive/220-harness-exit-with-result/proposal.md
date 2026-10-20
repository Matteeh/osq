---
title: A task whose harness exits non-zero after writing its result file is judged by osq's own verify, not discarded as crashed
depends_on: []
verify: pnpm verify
check: sh scripts/verify-rust.sh
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - version-control
---
## Goal

On 2026-10-19, 219 task 3 died as `crashed` twice in a row, and the two crashes
used up its automatic retries. Each time, opencode with
`opencode-go/deepseek-v4.1-flash` hit a provider error mid-session
(`provider.invalid-output: "OpenAI Chat stream ended without finish_reason"`),
kept going, finished the work and wrote `.run/results/3.md`, and still exited
1. A manual `osq retry 219 3` then passed with exit 0 and the same code.

The cause is in `spawnTaskAgent` (`src/watcher/spawn.ts`). It writes the dead
marker as soon as the exit code is not 0, before it looks for the result file
and before the watcher's own verify. With this change, a non-zero exit after
the attempt wrote its result file goes on to the same checks a clean exit gets.
The watcher's verify decides whether the task is done, so the rule that osq
trusts nothing an agent says still holds. The task's events gain an
`exit_continued` event, so `osq show`, the archive and `osq query` readers can
tell such an attempt apart from a clean exit.

A result file left by an earlier attempt does not count. The executor protocol
keeps the previous attempt's result file for the next attempt to read, so only
a file modified at or after this attempt's spawn started counts as written by
it.

Rust osq reads every archived event line, and a line with an unknown `type`
is a read error (ADR 025). Task 1 therefore adds `exit_continued` to the Rust
core's `Event` enum first, so an archived change that holds the new event still
reads under Rust.

## Verify

`pnpm verify`

It runs both typechecks, the build, every TypeScript test and lint on the final
tree. That includes the new `tests/exit-with-result.test.ts`, the four crash
tests task 2 updates, and the line and function budget tests over the changed
watcher modules.

The proposal's `check`, `sh scripts/verify-rust.sh`, runs the Rust format
check, clippy, every Rust test, and the mutation check on the Rust lines task 1
touched. osq runs it after `pnpm verify` at archive and when `osq land` merges
a newer default branch.

## Non-goals

- Turning opencode's `{"type":"error"}` stream lines into task events, or
  changing any harness adapter.
- Changing retry counts, the provider-outage rules or the usage-limit pause.
  A usage limit still pauses the task before any exit is judged.
- Showing `exit_continued` as its own line in `osq show`, the dashboard or a
  `osq query` table. The event is in the task's event file for them to read
  later.
- Synthesizing a result file from the agent's final message after a non-zero
  exit. That stays a zero-exit fallback.
- Folding `exit_continued` into the Rust task state. Like `exited`, it leaves
  the state unchanged.

## Surface

- Added: `exit_continued` (task event type, data `exitCode`, written by the watcher)

## Decisions

- ADR 002: archive and delta application are not touched.
- ADR 010: the validator is not touched.
- ADR 012: the supervisor is not touched; the decision is made from files, so it survives a watcher restart.
- ADR 018: automatic steering is not touched.
- ADR 019: the tapped planner is not touched.
- ADR 021: autopilot is not touched; a task that now becomes done instead of dead simply lets autopilot go on.
- ADR 022: `exit_continued` is one more variant of core's single `Event` enum; no feature crate changes.
- ADR 023: the new payload type and match arms carry doc comments, and no workspace lint is loosened.
- ADR 024: the changed public items keep their `Implements: rust-core/event-types` tag, and the updated test keeps `Covers: rust-core/every-event-type-parses`.
- ADR 025: `exit_continued` is a new event `type`, the additive way the event format grows; the Rust core reads and writes it as TypeScript writes it.
- ADR 026: OpenSpec handling is not touched.

## Assumptions

- A result file whose modification time is at or after the attempt's spawn start was written by that attempt. Both times come from the same machine's clock.
- Four existing tests make the mock agent crash with the mock's default result file still written, and expect `crashed`: `tests/runner-done-dead-events.test.ts`, `tests/runner-outcome-logging.test.ts`, `tests/watcher-loop-logging.test.ts` and `tests/dead-fingerprint.test.ts`. A prototype of this change in a scratch copy on 2026-10-19 failed exactly those four cases and no others. Task 2 adds `writeResult: false` to each crash behavior, which keeps what they test.
- `src/watcher/spawn.ts` has 199 lines, and `tests/import-graph.test.ts` caps the runner lifecycle modules below 200. Task 2 moves `ensureTaskResult` out of it into a new module, which makes room for the new check.
- No golden event fixture changes. The golden flows exit 0, and no existing event gains a key.

## Contract

The watcher-and-harness and rust-core deltas below are the contract.

## Human steps

### Before approval

None

### After landing

- Restart the watcher so it runs the new build.
- Mark the Notion Bugs and incidents row "Recoverable provider error throws away finished task work" fixed.

## Delta

- `specs/rust-core/spec.md`: MODIFIED "Event types" gains the `exit_continued` row in its field table and in the "Every event type parses" table (task 1).
- `specs/watcher-and-harness/spec.md`: ADDED "Failed exit with a result" (task 2).

Every file belongs to one task. Task 2 adds `exit_continued` to `src/harness/types.ts`; task 1 touches only the Rust core.
