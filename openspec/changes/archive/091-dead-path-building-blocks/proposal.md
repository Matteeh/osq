---
title: Dead-path building blocks
depends_on: []
verify: pnpm verify
features:
  reads:
    - version-control
    - watcher-and-harness
---
## Goal

osq has the pieces that put a worktree back to its last verified state after a
task dies, each tested on its own against a temporary osq worktree. One
function builds every osq commit message with its trailers, and one records a
dead task: patch first, then discard outside the change folder, then commit
the dead record. `discard` stops treating an empty path list as "everything",
and handles a path the agent staged. `commit` records only the paths it was
given. Nothing calls the dead path yet; `run-in-worktree` wires it in.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests against temporary
repositories with a linked worktree on an `osq/` branch prove the port fixes,
the commit message and its trailers as `git interpret-trailers` parses them,
and the dead record's order, contents, and patch, including a new untracked
file restored with `git apply`.

## Non-goals

- Calling any of this from the runner, the loop, or the reaper.
- Writing `.run/dead/<n>.md` or the dead event; the watcher already does.
- The verified-task commit; `run-in-worktree` builds it with the same message function.

## Surface

- Added: commit subject `osq: <id> task <n> dead, reason <reason>` (commit format)
- Added: commit trailers `Osq-Change`, `Osq-Task`, `Osq-Model`, and `Osq-Version` (commit format)
- Added: `.run/dead/<n>.patch` (marker file)

## Decisions

- ADR 002: archive is unchanged.

## Background

ADR 003 decisions 1 and 4. This is change 4 of stage 1, before
`run-in-worktree`, so no state with the flag on leaves a dirty worktree behind
a dead task.

`discard` in `src/core/vcs/git-vcs-write.ts` runs `clean -fd -- ...paths`;
with an empty list that removes every untracked file in the worktree, change
folder included. It restores tracked paths with `checkout HEAD --` over what
`ls-files` lists, which is the index, so a new file the agent staged makes
that checkout fail. `commit` runs `git add -- <paths>` and then commits the
whole index, so anything already staged would ride along into a dead commit.

The outcome line comes from `formatTaskOutcomeLine` in `src/watcher/outcome.ts`
with symbols off; core must not import the watcher, so the caller passes the
line in. The `started` event's data holds `harness`, `model`, and `osqVersion`
(`StartedEventData` in `src/harness/types.ts`); a task has one per attempt.

`git-vcs-write.ts` has 214 lines. `reset` and `--force` are on the structural
test's forbidden argument list.

## Contract

### Requirement: Nothing calls the dead path
No runner, loop, or reaper code SHALL call the dead record or the commit
message function in this change.

#### Scenario: Watcher unchanged
- **WHEN** a task dies with this change landed
- **THEN** the watcher writes the same markers and events as before, and makes no commit

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/version-control/spec.md`: modifies "Vcs write operations".
- `specs/watcher-and-harness/spec.md`: adds "Osq commit message" and "Dead task record".

Three tasks, and no file is shared. Task 3 calls task 1's port and task 2's
message function.
