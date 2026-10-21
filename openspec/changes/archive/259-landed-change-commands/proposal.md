---
title: osq retry and osq plan say what to do for a landed change instead of failing or leaving a folder behind
depends_on: []
verify: pnpm verify
features:
  reads: ["watcher-and-harness", "version-control", "status-inspection", "metrics-and-reporting", "spec-lint-and-approve"]
---
## Goal

Two commands misbehave on a change that has archived or landed.

- **Retry:** `osq retry <id> change` cannot clear a land-time regression on an archived change, because `findChange` lists only active changes. After 248's `sync_verify_red` stop, the marker had to be removed and committed by hand.
- **Plan:** `osq plan <id>` for a landed change creates a junk change folder, such as `250-248`, before it fails on the missing brief, because a name that matches no active change is taken as a new change's name.

After this change, retry clears an archived change's land stop on its branch, so the next `osq land` runs the sync again. Plan refuses a finished change, writes nothing, and says how to start new work.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new
retry test builds a repository with a worktree and makes `osq land` stop
with `sync_verify_red`. It then fixes the default branch, retries and lands,
through the same `createRecoveryProject` helpers the land recovery tests use.
The new plan test runs `planCommand` for a landed change and for an archived
one and checks that no folder appears.

## Non-goals

- Retrying task-level regressions of archived changes; `osq retry <id> <n>` on one is refused and names `osq retry <id> change`.
- Changing how a land stop is steered through `osq plan` and `osq approve`, or `osq plan --run`, which already refuses a change with nothing to plan.
- Retrying a change the default branch already holds.

## Surface

- Changed: `osq retry <id> change` (command) also clears the land stop of an archived change in an osq worktree, committing `osq: <id> land retry` on its branch.
- Changed: `osq plan <id>` (command) refuses an archived or landed change instead of creating a new change folder.

## Decisions

- ADR 001: config loading is untouched.
- ADR 004: the OpenSpec validator is untouched.
- ADR 005: the validator peer range is untouched.
- ADR 010: the validator role is untouched; retry runs no validator.
- ADR 012: the watcher service is untouched; retry still writes only marker and event files, and their commit.
- ADR 015: the MCP tools are untouched.
- ADR 018: a land stop that needs a revised plan still goes through the steering planner; retry is for a stop whose cause was fixed elsewhere.
- ADR 019: `osq plan --run` keeps its own refusal for a change with nothing to plan.
- ADR 021: autopilot does not call the new retry path.

## Assumptions

- Clearing a land stop commits the retained marker and the event on `osq/<folder>`, as `recordLandStop` committed the stop. Land refuses a worktree with uncommitted changes, so an uncommitted clear could not be landed. This is the same edit the human made by hand for 248, done by osq. A `sync_conflict` stop can be cleared too, but its next land stops again until a planner steers it.
- Retry still compares the archived folder with its approval seal. Since 253, archiving leaves the seal intact. An older archive whose seal no longer matches gets the existing `osq approve <id>` advice.
- `osq plan <id>` refuses an archived change in any tree that `findSteeringChange` has not already handled: one that needs steering is still reopened, and an approved one in a worktree without steering keeps its existing message.
- The commit runs in `retryCommand` in `src/cli/retry.ts` after `retrySpec` returns, and the archived lookup and the plan refusal live in new files. That is because `src/core/lifecycle/retry.ts` and `src/cli/plan.ts` are both at 249 of the 250 lines `tests/line-budget.test.ts` allows. The watcher's automatic retries only ever reach active changes, so they never need the commit.
- Task 1 edits `src/core/lifecycle/retry.ts`, which watcher-and-harness owns, with no watcher-and-harness delta, and lint warns about it. The edit only swaps `findChange` for the new lookup, and the retry command's behaviour is specified in cli-foundation's "Explicit retry command".
- Tests prove the scenarios with `node:test` titles, because the living cli-foundation spec holds duplicate scenario names the `scenario` helper refuses (as found in 253 for watcher-and-harness).

## Contract

### Requirement: Explicit retry command

See `specs/cli-foundation/spec.md`.

### Requirement: Planning a change that needs steering

See `specs/cli-foundation/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: MODIFIED "Explicit retry command", which keeps its five scenarios and adds "Retrying a land stop on an archived change" and "Retrying a task of an archived change". MODIFIED "Planning a change that needs steering", which keeps its five scenarios and adds "Plan a finished change".

The two tasks write separate requirements of one delta file and share no source or test file.
