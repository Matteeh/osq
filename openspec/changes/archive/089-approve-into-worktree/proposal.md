---
title: Approve into a worktree
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - metrics-and-reporting
    - spec-lint-and-approve
    - status-inspection
    - version-control
    - watcher-and-harness
    - web-inspection
---
## Goal

With `vcs.enabled`, `osq approve` gives the change its own branch,
`osq/<folder>`, and its own worktree, and writes nothing to the checkout. The
branch's first commit holds the approved folder with `.run/approved`,
`.run/base`, and `.run/approver`. The change locations resolver lists the osq
worktrees, so status, show, the inbox, the dashboard, and the lifecycle
commands see a running change in its worktree, and `osq status` prints the
worktree path and warns when the checkout's copy has changed since approval.
The watcher leaves worktree changes alone until `run-in-worktree` teaches it to
run them. With the flag off, nothing changes.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests against temporary
repositories, with `vcs.worktreeRoot` inside the test's temporary folder,
prove the default branch and worktree path, the resolver's worktree trees and
the watcher skipping them, the dashboard watching worktree folders, every
approve refusal and the approval commit, and the status lines. Every existing
test passes unchanged except the port member list in `tests/vcs-write.test.ts`.

## Non-goals

- Running tasks in a worktree, committing task results, or the dead path.
  `run-in-worktree` does that.
- Stacking a dependent on an unlanded dependency. Approve refuses instead.
- Removing worktrees or branches, including after a failed prepare.
- Re-approving a change inside its worktree.
- The status warning not to edit a worktree while a task runs; no task runs
  there yet.
- Flagging leftover checkout copies after a change lands.
- Watching worktrees created after `osq serve` started.

## Surface

- Added: `vcs.defaultBranch` in `osq.config.ts` (config key)
- Added: `osq approve --base-ok` (flag)
- Added: `osq approve --ignore-dirty` (flag)
- Changed: `osq approve` with `vcs.enabled` creates branch `osq/<folder>` and a worktree, commits `osq: <id> approved`, and prints `Worktree:` and `Branch:` lines (command behaviour)
- Added: `.run/base` and `.run/approver` in an approved change folder under `vcs.enabled` (marker files)
- Added: `  worktree: <path>` and the checkout copy warning under a running change in `osq status` (command output)

## Decisions

- ADR 001: `vcs.defaultBranch` loads through the existing jiti config path.
- ADR 002: archive is unchanged; the watcher only skips worktree changes.
- ADR 004: approve lints in the checkout exactly as today, validator call included.
- ADR 005: no version check moves.

## Background

ADR 003 decisions 2, 3 and 11, as revised on 2026-09-26. This is change 3 of
stage 1. Change 087 added the resolver in
`src/core/status/change-locations.ts`, and change 088 added the `vcs` block and
the port's `createBranch`, `worktreeAdd`, `worktreeList`, and `commit`.

`GitVcs` runs git in one fixed directory, and `selectVcs` returns a `GitVcs`
for a linked worktree's own path, because `git rev-parse --show-toplevel` there
names the worktree. Approve commits in the worktree through a second
`selectVcs` call; only `select.ts` imports `GitVcs`.

Approve writes `.run/` files today: observed planning records, `approved`, and
`manifest.json`. Under `vcs.enabled` all three go into the worktree's copy, so
the checkout is never written.

The checkout's copy of a running change has no `.run/approved`. The resolver
tells it from a draft because an osq worktree holds a folder of the same name,
and it then reports only the worktree's copy.

Budgets that shape the tasks: `src/cli/index.ts` has 249 of 250 lines, so the
approve command's registration moves into `src/cli/approve.ts`.
`approveSpec` has 76 of 80 lines. `src/core/web/web-events.ts` has 242 lines.
`src/core/vcs/git-vcs.ts` and `git-vcs-write.ts` have 201 each.
`tests/vcs-write.test.ts` pins the port's member list, so the task that adds
`defaultBranch` updates it.

## Contract

### Requirement: Flag off changes nothing
With `vcs.enabled` off, or with `NoVcs` selected, approve, the resolver, the
watcher, status, and the dashboard SHALL behave as before this change.

#### Scenario: Existing suite
- **WHEN** the existing tests run with this change landed
- **THEN** every one passes unchanged, except the port member list in `tests/vcs-write.test.ts`

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: modifies "Version control configuration".
- `specs/version-control/spec.md`: modifies "Vcs port", and adds "Worktree location".
- `specs/status-inspection/spec.md`: modifies "Change locations", and adds "Running change in status".
- `specs/watcher-and-harness/spec.md`: adds "Worktree changes wait".
- `specs/web-inspection/spec.md`: adds "Invalidation across worktrees".
- `specs/spec-lint-and-approve/spec.md`: adds "Approval into a worktree" and "Approval refusals under version control".

Five tasks, and no file is shared. Task 1 owns the config key, the port, and
the worktree path. Task 2 owns the resolver and the watcher's skip, which
tasks 3 to 5 read through `ChangeTree`. Task 4 owns approve and its command.
