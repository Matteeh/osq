---
title: Run in the worktree
depends_on: ["089", "091"]
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - metrics-and-reporting
    - spec-lint-and-approve
    - status-inspection
    - version-control
    - watcher-and-harness
---
## Goal

With `vcs.enabled`, a change runs start to finish on its own branch. The
watcher runs it inside its worktree, commits each verified task and the
archive, and puts the branch back to its last verified state when a task dies,
keeping the agent's edits in `.run/dead/<n>.patch`. A dirty worktree, a HEAD
off the change's branch, or a failed commit halts the change until a human
runs `osq retry <id> change`. Inside a worktree the git guard's violations
kill the task. `osq watch` recreates a missing worktree, `osq status` warns not
to edit one while a task runs, and the lifecycle commands write where the
change runs. With the flag off, the watcher behaves exactly as today.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests on temporary
repositories approve a change into a linked worktree on an `osq/` branch and
drive it through the real entry points, `runTask`, `runWatcherCycle`,
`watchCommand`, `retrySpec`, `rejectSpec`, `markTaskDoneManual`, and
`getStatusOverview`, with an adapter stub that edits files in the worktree.
They prove the commits and their contents, the dead path from the runner and
the reaper, each halt, the violations that kill, the new test file exemption,
worktree recreation, and that the checkout is never written.

## Non-goals

- Stacking dependent changes, sync with main, `osq land`, and concurrency.
- `osq message`, leftover draft copies in status, and traceability through
  `.git` files; the next stage-1 changes do those.
- Committing a rejection. `osq reject` moves the folder inside the worktree
  and leaves the move uncommitted.
- Retrying a failed commit on its own. Only `osq retry <id> change` lets the
  next cycle try again.
- Turning `vcs.enabled` on for osq itself.

## Surface

- Changed: the watcher runs a change approved into a worktree instead of skipping it (command behaviour)
- Added: commit subjects `osq: <id> task <n> verified` and `osq: <id> archived` (commit format)
- Added: change-level regression reasons `worktree_dirty`, `worktree_off_branch`, and `commit_failed`, in `.run/regressed/change.md` (marker reasons)
- Added: `vcs_violation` and `scope_violation` dead reasons inside a worktree, eligible for an automatic retry (dead reasons)
- Changed: a new untracked file under `tests/` is never a scope violation (event behaviour)
- Added: `osq watch` prints `recreated worktree <path> for <folder>` (command output)
- Added: `  warning: a task is running in this worktree; do not edit it until the task ends` in `osq status` (command output)
- Changed: `osq reject` moves a change running in a worktree into that worktree's rejected directory (command behaviour)

## Decisions

- ADR 002: the archiver still merges deltas without a model; the archive commit only records its result.
- Departs from ADR 003: the clean check before a spawn also allows the change's `tasks.md`, because `osq done` ticks it between tasks and the next task's commit records it, the same way `.run/` records are.

## Background

ADR 003 decisions 1, 3, 4, 8, and 11. This is change 5 of stage 1.

`runWatcherCycle` in `src/watcher/loop.ts` already passes each change's tree
root to `runTask`, the scope audit, the mutation check, and the archiver, and
`runVerificationGate` already sets `OSQ_CHANGE` to the folder it is given. The
loop skips worktree changes with one `continue`, which "Worktree changes wait"
requires; this change removes both. `loop.ts` is on the line budget's allow
list and `runWatcherCycle` is grandfathered in the function budget, so new
behaviour goes in new modules the loop calls.

Every dead marker reaches the loop: through `runTask`'s return, from
`runner.ts`'s `fail` and the two writers in `spawn.ts`, or from the reaper
block in the loop. The runner lifecycle modules are capped under 200 lines by
`tests/import-graph.test.ts`; `runner.ts` has 196, `outcome.ts` 196,
`spawn.ts` 197, and `verify.ts` 198. The git guard reaches the runner through
one statement.

`src/core/run/dead-commit.ts` (`commitDeadTask`) and
`src/core/run/commit-message.ts` (`formatCommitMessage`,
`readCommitTrailers`) landed in 091. `src/core` may not import `src/watcher`,
so the watcher passes `formatTaskOutcomeLine`'s line in. A change-level
regression, `.run/regressed/change.md`, already stops the loop from spawning
or archiving, shows in `osq status` and the inbox, and clears with
`osq retry <id> change`; the halts reuse it with new reasons.
`recordRegressedEvent` takes any reason string and an `output` field.

`status` lists untracked files one by one, and `.run/running/` is gitignored,
so lock files are never dirt. A verified task whose commit has not happened is
the one whose `.run/done/<n>` status lists as untracked.

The brief asks to recreate a worktree whose change "is approved and has a
pending task". Recreation reads only the branch tip, so it uses "the tip holds
`.run/approved` in the changes directory", which is an approved change that
has not archived; the loop then decides what to run. A worktree whose
directory was deleted by hand is still listed by `git worktree list`, so
recreation prunes those records first.

`rejectSpec` builds its destination from the project root and would move a
worktree's folder into the checkout. `retrySpec` runs a recertification verify
and scope hash in the project root. `markTaskDoneManual` and the verification
commands already write through `findChange` and `resolveSpecFolder`.

A trial on `26ece81` of the loop change, the guard, the port read, and the
lifecycle roots broke only `tests/change-locations-worktrees.test.ts` ("leaves
an approved change in a worktree untouched during a cycle") and
`tests/vcs-write.test.ts` ("exposes exactly the intended members on the
port").

## Contract

### Requirement: Flag off unchanged
With `vcs.enabled` off, the watcher, the runner, and the lifecycle commands
SHALL behave exactly as before this change.

#### Scenario: Existing suite
- **WHEN** the existing watcher, runner, retry, reject, done, and status tests run
- **THEN** every one passes except the two the trial named, which their tasks update

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/watcher-and-harness/spec.md`: removes "Worktree changes wait"; adds "Worktree run", "Worktree halt", "Verified task commit", "Archive commit", "Commit failure", "Dead path in a worktree", "Violations kill in a worktree", and "Lifecycle commands in a worktree"; modifies "Git state recording", "Scope violation recording", and "Automatic retry".
- `specs/version-control/spec.md`: modifies "Vcs port" and "Vcs write operations"; adds "Worktree recreation".
- `specs/status-inspection/spec.md`: modifies "Running change in status".

Four tasks, and no file is shared. Task 2 relies on task 1's dead reasons, and task 3's test runs a task through task 2's loop.
