---
title: osq land lands an archived change in one command, and living specs never conflict
depends_on: ["104"]
verify: pnpm verify
features:
  reads:
    - spec-lint-and-approve
    - web-inspection
---
## Goal

`osq land <id>` lands a change that archived on its `osq/` branch onto the
default branch in one command. When the default branch has moved since the
branch was cut, osq first merges it into the branch inside the change's
worktree, rebuilds each living spec the change writes from the default
branch's copy plus the change's deltas, and runs the change's `verify` on the
merged tree. Only then does it squash into the checkout, which by then cannot
conflict, and commit with the message `osq message` prints. It removes the
leftover draft and the worktree, and keeps the branch.

Two changes cut from the same default branch that both write one capability,
as 101 and 102 did, then land one after the other with no hand-resolved
conflict.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. The new port operations are
tested on temporary repositories through `GitVcs`, the sync through
`syncWithDefaultBranch`, and landing through `landCommand` on temporary
projects that approve and run changes into real worktrees.

## Non-goals

- The `osq sync <id>` command, the watcher's syncs before the first task and
  before archive, and the last sync in `osq status`. They are the `osq-sync`
  queue item, which reuses `syncWithDefaultBranch`.
- Resolving a conflict outside the living specs. It aborts the merge, as ADR
  003 decision 5 says, and a human merges by hand in the worktree.
- Rebuilding sidecars or any other file under `openspec/specs/` except
  `spec.md`. git merges them, and a conflict there stops the land like a code
  conflict.
- Running every task's `verify` at land. Only the change-level `verify` runs.
- A key for `osq land` in the inbox card session. The card lists it for a
  human to run.
- Pushing, pull requests, and mode B.
- Deleting the branch, or removing a worktree by force.

## Surface

- Added: `osq land <id>` (command)
- Added: `osq: <id> sync <default branch>` (commit subject on the change's branch)
- Changed: `osq message <id>` prints `Land: osq land <id>` on stderr
- Changed: the inbox `land` item's command is `osq land <id>`

## Decisions

- ADR 001: `osq land` loads `osq.config.ts` through `loadConfig`, as every command does.
- ADR 004: unchanged; `osq land` runs no validator.
- ADR 005: unchanged; nothing here checks the validator range.
- ADR 002: the sync rebuilds living specs with `applyOpenSpecDeltas`, the same function archive uses, never with a text merge.
- ADR 003: `osq land` is the one command that writes the checkout's default branch. It never rebases, resets, or force-removes. It refuses a dirty checkout, an unarchived branch, and a stack on an unlanded dependency. It stops before re-applying a delta over a requirement the default branch changed (decision 5). Commits are authored by `vcs.author` (decision 8), and the land commit's hooks run.
- ADR 003: task 4 revises decision 1 so that `Osq-Head` names the branch tip that landed, which is the sync commit when land synced, and decision 7 so that land syncs first.

## Background

**Where the merge happens.** The merge and the `verify` run in the change's
worktree, not in the checkout. This worktree is osq's own. It already has
`node_modules`, and a failed merge undoes itself with `git merge --abort`. The
checkout is written only by the final squash and commit. By then the branch
contains the default branch, so the squash cannot conflict, and it produces
the exact tree that was just verified. Two alternatives were rejected.
Squashing in the checkout and verifying there would need a way to undo writes
to the human's tree, which the port forbids by design. A throwaway worktree
would need its own install, and a failed attempt would leave a dirty worktree
that osq may not force-remove. `git merge-tree --write-tree` needs git 2.38,
and this machine has 2.34.

**Lost updates.** Under OpenSpec a MODIFIED requirement replaces its whole
block. So before merging, the sync compares every requirement the change
modifies, removes, or renames between `.run/base` and the default branch. It
stops when any of them changed, as ADR 003 decision 5 requires. The fix is to
reject and plan again.

**Landing out of order.** `tests/living-specs-delta-equivalence.test.ts`
replays deltas in archive order ("Living spec replay in landing order"). Almost
every change writes `cli-foundation`, so landing a later change before an
earlier one that shares a capability would break that replay. `osq land`
refuses then and names the change to land first. Landing in archive order
never triggers it. If this refusal causes trouble in practice, the fix is to
replay in git's landing order instead, with a spec change to that requirement.

**Checkout rules.** Staged or modified tracked files refuse the land.
Untracked files do not, because drafts live there untracked. A hook that
rejects the final commit leaves the squash staged, and osq prints how to finish
or undo it. osq does not roll back the human's checkout.

**Already landed.** For a change landed by hand, such as 101 and 102 with
their worktrees kept, `osq land` only cleans up.

**Removing a worktree.** git refuses to remove a worktree with modified or
untracked files, but deletes ignored files with it: `node_modules`, `dist`,
and anything ignored a human put there.

**Room for the command.** `src/cli/index.ts` has 249 lines and a cap of 250.
Task 3 moves the `doctor` registration into `registerDoctorCommand` in
`src/cli/doctor.ts`, following `registerMessageCommand`, which makes room for
`registerLandCommand`.

**Shared delta application.** `applyOpenSpecDeltas` moves from
`src/watcher/archiver.ts` to `src/core/spec/apply-deltas.ts`, because core
may not import the watcher. `archiver.ts` imports it, calls it as before, and
re-exports it. Existing tests import it from `archiver.ts`, and
`tests/living-specs-delta-equivalence.test.ts` pins that call.

## Contract

### Requirement: Existing behaviour is unchanged
Approval, the watcher, archive, `osq status`, and `osq message`'s stdout
SHALL be unchanged.

#### Scenario: Existing suites
- **WHEN** the existing suite runs
- **THEN** every test passes, except the three whose landing command text task 4 updates

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/version-control/spec.md`: adds "Vcs merge operations", "Default branch sync", "Land refusals", "Land", and "Land cleanup".
- `specs/cli-foundation/spec.md`: adds "Land command"; modifies "Message command" and "osq runs its own changes under version control".
- `specs/status-inspection/spec.md`: modifies "Dispatch items" and "Card keys".
- `specs/watcher-and-harness/spec.md`: modifies "Deterministic delta spec archival and appender removal" so that archive and the sync share `applyOpenSpecDeltas`.

Four tasks. Task 1 adds the port's merge operations. Task 2 moves
`applyOpenSpecDeltas` into core and builds the sync. Task 3 builds landing and
the command. Task 4 points the inbox, `osq message`, README, and ADR 003 at
`osq land`.

No file is shared between tasks.
