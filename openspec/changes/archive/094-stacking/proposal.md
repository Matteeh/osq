---
title: Stacking dependent changes
depends_on: ["093"]
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

With `vcs.enabled`, a chain of dependent changes approved at once runs
without a human, as it does with the flag off. Approving a change whose
`depends_on` names an approved change that has not landed no longer refuses.
It records a stacked approval outside the repository and waits. Once the
dependency's archive commit exists, the watcher cuts the dependent's branch
from that commit, creates its worktree, and commits its approval there. When
the dependency changes or is rejected before it lands, the dependent halts
with a message to approve it again, and approving it again starts from the
new base. `osq reject` commits the rejection on the change's branch, removes
the worktree when it is clean, and keeps the branch.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests on temporary
repositories use the real entry points: `approveSpec`, `runWatcherOnce`,
`runWatcherCycle`, `rejectSpec`, `changeTrees`, and the `Vcs` port. They prove
that a two-change chain approved at once runs to its second archive commit
with the dependent cut from the dependency's archive commit. They also prove
that a dependency landed by hand makes the dependent start from the default
branch, and they cover each halt, re-approval, the cut resuming after a
failure, and reject's commit, worktree removal, and kept branch. They also
show that the checkout is never written.

## Non-goals

- Syncing a dependent with the default branch after its dependency lands.
  That is stage 2.
- Stacking on a dependency that is still a draft. It stays blocked as today.
- Waiting on a dependency whose own `verified` step is pending after it
  lands. The dependent's worktree derives it as blocked, as today.
- A status line for a stacked change. It derives as `blocked` on its
  dependency, as any waiting change does.
- Keeping a rejection record for a stacked change. Rejecting one deletes its
  stacked approval, and the checkout's draft remains.
- Turning `vcs.enabled` on for osq itself.

## Surface

- Changed: `osq approve` with `vcs.enabled` records a stacked approval for a change whose dependency is approved and has not landed, instead of refusing, and prints `  Waiting for: <folders>` and `  Stacked: <path>` (command behaviour)
- Added: the stacked approval directory `<vcs.worktreeRoot>/<repo>/.stacked/<folder>/` (file location)
- Added: `.run/stacked-on`, one `<folder> <approved hash>` line per awaited dependency (marker file)
- Added: `osq watch` logs `stacked <folder> on <base>: worktree <path>` (command output)
- Added: change-level regression reasons `dependency_changed`, `dependency_diverged`, and `stack_cut_failed` (marker reasons)
- Added: `pathExists` read on the `Vcs` port (port)
- Added: commit subject `osq: <id> rejected` (commit format)
- Changed: `osq reject` with `vcs.enabled` commits the rejection, removes a clean worktree, keeps the branch, and prints `  Worktree removed: <path>` or `  Worktree kept: <path> (<why>)`. For a stacked change it deletes the stacked approval and prints `  Withdrew stacked approval: <path>` (command behaviour)

## Decisions

- ADR 002: the cut takes the dependency's archive commit as it is; nothing re-applies or merges a delta.
- ADR 004: a stacked approval lints in the checkout with the pinned validator exactly as any other approval does.
- ADR 005: unchanged; the validator range check runs before a stacked approval is recorded.
- Departs from ADR 003: `osq reject` commits the move into the rejected directory as `osq: <id> rejected`, a sixth commit kind beside decision 1's five, because the move leaves the worktree dirty and only a clean worktree can be removed; the branch then keeps the rejection record.

## Background

ADR 003 decisions 2 and 5; change 6 of stage 1. The branch `osq/<folder>`
cannot exist while a dependent waits, because it must be cut from a commit
that does not exist yet, and osq never moves or deletes a branch. The waiting
approval is therefore a directory under `vcs.worktreeRoot`, beside the
worktrees, laid out as a one-change tree: the sealed copy sits at
`<changes directory>/<folder>` inside it. The human chose this over writing
the checkout's `.run/` (ADR 003 forbids it) and over a hash-only record.
Deleting the directory by hand loses the approval, and the change reads as a
draft again until it is approved again.

Because the change locations module lists that directory as a tree, the
stacked change derives as `blocked` in status and inbox, a halt lands in
its own `.run/regressed/change.md`, `osq retry <id> change` clears it, and
the watcher loop leaves it alone. Only the new stack step acts on it.

`approve-worktree.ts` has 241 lines; replacing `refuseUnlandedDependencies`
frees room, and the dependency reads go in a new module.
`runWatcherCycle` is grandfathered in the function budget, so the loop gains
one call and the behaviour lives in a new watcher module. Nothing outside the
listed files may call `getChangesDir` or `getArchiveDir`
(`tests/change-locations-readers.test.ts`). New code takes directories from
`changeTrees`.

A trial adding `pathExists` to the port broke only
`tests/vcs-write.test.ts` ("exposes exactly the intended members on the
port"); no test fake implements `Vcs`. Reading the tests found two more
pins: replacing the refusal breaks
`tests/approve-worktree.test.ts` ("refuses an approved dependency that has not
landed"), and committing and removing on reject breaks
`tests/worktree-lifecycle.test.ts`'s reject case, which reads the rejected
folder inside the removed worktree. Each is in its task's scope.

## Contract

### Requirement: Flag off unchanged
With `vcs.enabled` off, approve, the watcher, and reject SHALL behave exactly
as before this change.

#### Scenario: Existing suite
- **WHEN** the existing approve, watcher, and reject tests run
- **THEN** every one passes except the three Background names, which their tasks update

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/version-control/spec.md`: modifies "Vcs port" and "Worktree location".
- `specs/status-inspection/spec.md`: modifies "Change locations".
- `specs/spec-lint-and-approve/spec.md`: modifies "Approval refusals under version control"; adds "Stacked approval" and "Stack dependency state".
- `specs/watcher-and-harness/spec.md`: adds "Stacked cut", "Stacked halt", and "Rejection under version control"; modifies "Lifecycle commands in a worktree".

Five tasks, and no file is shared. Task 2 lists the stacked directory that
task 1 names. Task 3 writes stacked approvals into it. Task 4 cuts them
using task 3's dependency reads. Task 5 rejects both kinds and updates
README.md.
