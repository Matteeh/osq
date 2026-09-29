---
title: Approval never races the watcher, a halted change says retry, and a rejected change can be approved again
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - metrics-and-reporting
---
## Goal

Three things blocked approving 115 and 116 on 2026-09-29.

The watcher halted 116 with `worktree_dirty` in the moment between
`osq approve` writing `.run/approved` into the new worktree and committing it.
`osq status` then told the human to reject 116, when `osq retry 116 change`
was the fix. And `osq approve 115` failed with
`branch osq/115-retire-source-comments already exists`, because `osq reject`
had kept the branch of 115's first, rejected attempt.

After this change, the watcher leaves a worktree change alone until its
approval commit exists, a change-level halt points at
`osq retry <id> change`, and approve renames a rejected change's kept branch
aside instead of refusing.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests check that
`renameBranch` keeps a branch's commits and refuses a taken name, that approve
renames a rejected change's kept branch and still refuses any other existing
branch, that the watcher skips a worktree change whose approval commit is
missing and runs it once the commit exists, and that status and the inbox
name `osq retry <id> change` for a change-level halt.

## Non-goals

- Changing what `osq reject` does to the branch at rejection time.
- Deleting kept branches.
- Recovering an approval whose commit failed after the seal. `osq approve`
  already reports that error.
- Changing the dispatcher's halt item. `haltItems` in
  `src/core/status/dispatch-items.ts` already lists `osq retry <id> change`
  first.

## Surface

- Added: `Kept rejected branch: <branch>` line in `osq approve` output.
- Changed: `osq status`, bare `osq`, and `osq inbox` name `osq retry <id> change` for a change-level regression, instead of `osq reject <id> --reason <text>`.

## Decisions

- ADR 002: unchanged; archive still merges this change's deltas without a model.
- ADR 004 and ADR 005: unchanged; approve still lints with the pinned validator before it touches a branch.

## Background

**The race.** `approveIntoNewWorktree` in `src/core/spec/approve-worktree.ts`
creates the branch and worktree, copies the change folder in, writes the seal
with `writeApprovalSeal`, and only then commits `osq: <id> approved`. The seal
has to be in that commit, so reordering the writes can't close the gap. The
watcher closes it instead: at the top of its per-change loop in
`runWatcherCycle`, a worktree change whose `.run/approved` doesn't exist at
HEAD is skipped for that pass. That runs before the reaper, the automatic
retry, the pending-task commit, `checkWorktree`, spawning, and archiving, so
none of them sees a half-written approval. `Vcs.pathExists('HEAD', …)`
already answers the question, so the watcher reads git each pass and
remembers nothing. A re-sealed approval still counts, because the check is
whether the file exists at HEAD, not whether it is unchanged.

**The hint.** `readActiveNextStep` in `src/core/status/next-step.ts` returns
`osq reject` when no task is dead or regressed. That only happens for a
change-level regression, which `osq retry <id> change` clears. The inbox's
`change-regressed` item in `src/core/status/inbox.ts` carries the same
`osq reject`.

**The kept branch.** `osq reject` keeps `osq/<folder>`, whose last commit
moves the change folder to `<changes>/rejected/<folder>/`, including
`.run/rejected.md`. Approve recognizes that branch by the tree at its tip:
`pathExists('osq/<folder>', '<changes>/rejected/<folder>/.run/rejected.md')`.
That needs no new read method and no second copy of the commit subject. It
renames only when no worktree has the branch checked out, since a kept
worktree would also block `worktreeAdd`. The rename is a new `Vcs` write,
`renameBranch`, run as `git branch -m`, which fails when the new name exists.
It moves a name and deletes no commit, so "Operations osq never runs" still
holds. It happens where the refusal used to, before the digest, so a stacked
approval gets it too.

**Line budgets.** `src/core/vcs/git-vcs.ts` has 249 lines and
`git-vcs-write.ts` 246, against the 250-line cap. Task 1 moves the pure
parsers in `git-vcs.ts` (`nonEmpty`, `parseStashBranch`, `parseStashes`,
`parseStatus`) into a new `git-vcs-parse.ts`, and puts the git call for
`renameBranch` in `git-vcs-merge.ts`, beside the other branch-level helpers.
`approve-worktree.ts` has 244 lines, so task 2 moves the branch logic into a
new `approve-branch.ts`.

**Measured fallout.** A rough version of all four tasks ran in a scratch
worktree of main (`a58d549`) on 2026-09-29. Both typechecks, the build, lint,
and the UI suite passed. Five CLI tests failed, all expected pins:
`tests/vcs-write.test.ts` "exposes exactly the intended members on the port",
`tests/next-step.test.ts` "points a change regression at the reject command",
and three in `tests/inbox.test.ts` that expect `osq reject` for a
change-level regression. `tests/approve-worktree.test.ts` "refuses an
existing branch" still passes, because its branch holds no rejection record.

## Contract

### Requirement: Approval commit first
The watcher SHALL do nothing with a worktree change until its approval is
committed.

#### Scenario: Seal written, commit pending
- **WHEN** a worktree change's `.run/approved` exists but is not committed
- **THEN** the cycle spawns nothing and writes no marker for it

### Requirement: Halt hint
A change-level halt SHALL point at `osq retry <id> change`.

#### Scenario: Status after a halt
- **WHEN** change 116 halted with `worktree_dirty` and no task is dead
- **THEN** `osq status` shows `next: dead — osq retry 116 change`

### Requirement: Re-approve after rejection
Approve SHALL rename a rejected change's kept branch aside and approve.

#### Scenario: Second attempt
- **WHEN** 115 was rejected, planned again, and approved
- **THEN** its old branch is `osq/115-retire-source-comments-rejected-1` and a new `osq/115-retire-source-comments` holds the approval

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/version-control/spec.md`: modifies "Vcs write operations".
- `specs/spec-lint-and-approve/spec.md`: modifies "Approval refusals under version control" and adds "Rejected branch kept at approval".
- `specs/watcher-and-harness/spec.md`: adds "Approval commit before any worktree step".
- `specs/status-inspection/spec.md`: modifies "Action command contract" and "Next step commands".

Four tasks. Task 2 uses the `renameBranch` port method task 1 adds, so it
comes after task 1. No file is shared.
