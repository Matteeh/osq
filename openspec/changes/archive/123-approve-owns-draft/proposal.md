---
title: Approval moves the draft out of the checkout, and osq done goes
depends_on: ["109", "111"]
verify: pnpm verify
features:
  reads:
    - metrics-and-reporting
---
## Goal

With `vcs.enabled`, `osq approve` copies the change folder into the
change's worktree and leaves the original in the checkout. That copy looks
like the plan but drives nothing. osq carries code to cope with it: a
`Leftover drafts:` section in `osq status`, a warning when the copy is
edited, and a cleanup step in `osq land`. On 2026-09-28 a planning session
opened on 107's leftover copy as uncommitted work.

After this change, a change lives in one place once approved: its branch and
worktree, or its stacked approval. Approval removes the checkout's copy, and
the leftover code goes. A stacked change is edited in its stacked copy;
`osq approve` restores it to the checkout as a draft, approves it, and
removes it again. Rejecting a stacked change moves it back into the checkout
as a draft, because a stacked approval has no branch to keep it. ADR 003's
rule now says osq writes the human's checkout only through commands the human
runs.

The checkout's copy also kept each approved change's number taken, and let
lint find a running dependency. `osq new`, `osq plan`, and `osq lint` now
look in worktrees, stacked approvals, and `osq/` branches too.

`osq done`, which marks a task done without its verify, is removed, as ADR
006 decision 3 says. Archives that hold a manual done marker read as before.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests approve drafts
into worktrees and stacked approvals in temporary repositories and check
that the checkout's copy is gone, that a committed draft and a failed
approval keep it, that a stacked change re-approves and rejects from its
stacked copy, that status and land ignore a checkout folder of a running or
landed change, that new change numbers skip worktrees, stacked approvals,
and `osq/` branches, that lint finds dependencies there, and that `osq done`
is gone.

## Non-goals

- Changing what a stacked approval stores.
- Re-approving or planning a change that runs in a worktree. Approving it
  still refuses with `branch osq/<folder> already exists`. The
  `steering-triggers` item adds that path.
- `osq verified`. That's `checks-osq-runs`.
- Moving a rejected worktree change back into the checkout. Its plan stays on
  its kept branch `osq/<folder>`.
- Changing `osq doctor`'s done-markers check, which still accepts a manual
  marker an older osq wrote.
- Detecting or removing copies older approvals left in a checkout.

## Surface

- Removed: `osq done <id> <task> --manual <reason>` (command)
- Removed: the `Leftover drafts:` section of `osq status`
- Removed: the `osq status` warning `the checkout's copy of <folder> changed since approval; edits there never reach the run`
- Removed: the `Removed leftover draft <path>` line of `osq land`
- Changed: with `vcs.enabled`, `osq approve` removes the change folder from the checkout once the branch or stacked approval holds it, unless the checkout's HEAD holds the folder
- Changed: `osq approve` of a stacked change approves its stacked copy, not a checkout copy
- Added: `  Restored draft: <path>` line of `osq reject` for a stacked change, which now moves the change back into the checkout
- Changed: `osq new` and `osq plan` number a new change above changes in worktrees, stacked approvals, and `osq/` branches
- Changed: `osq lint` finds `depends_on` and `fixes` changes in worktrees, stacked approvals, and `osq/` branches
- Changed: ADR 003's rule in AGENTS.md's rules block (document section)

## Decisions

- Departs from ADR 003: decision 2 kept the checkout's copy so that `osq land` was the only command that writes the checkout. This change revises decision 2, decision 8's list, decision 11, and the rule: osq writes the human's checkout or main only through commands the human runs, which are `osq approve`, `osq reject` of a stacked change, and `osq land`.
- ADR 001: unchanged. `osq new` now loads `osq.config.ts` through `loadConfig`, which uses jiti.
- ADR 002: unchanged. Archive still merges deltas without a model.
- ADR 004: unchanged; lint's validator call does not move.
- ADR 005: unchanged.

## Background

**Measured fallout.** A rough version of this change, applied in a scratch
worktree on 2026-09-30, failed these test files outside the build-dependent
ones: `approve-stacked`, `approve-worktree`, `reject-worktree`,
`status-leftover`, `status-worktree`, `status-sync`, `vcs-land`,
`vcs-land-commit`, `done-manual`, `command-error-changes`, and
`worktree-lifecycle`. Before the lint fix, `stack-run`, `stack-cut-kept`,
`worktree-sync`, and `vcs-sync-command` also failed, all with
`depends_on names missing change`, because lint looked for a dependency only
in the checkout. Task 1 fixes that first. No test pins a removed or modified
requirement's name.

**Why a committed draft stays.** If the draft is committed at the checkout's
HEAD, removing it at approval leaves deleted tracked files. `osq land` would
then stop, because the land commit writes those paths. A committed draft
needs no removal: the land commit moves the folder into the archive, and the
fast-forward removes it from the checkout.

**Why numbering changes.** ADR 003 decision 11 relied on the checkout's copy
to keep a running change's number taken. Without it, `osq plan --next` after
approving 123 would create another 123. A change rejected in its worktree
also leaves nothing in the checkout, only its kept branch.

## Contract

### Requirement: The approved change lives in one place
With `vcs.enabled`, osq SHALL remove an uncommitted draft from the checkout
once its branch or stacked approval holds it, and SHALL keep reading the
change from there.

#### Scenario: Approve then plan the next change
- **WHEN** draft `123-a` is approved into a worktree and `osq plan --next` creates the next change
- **THEN** the checkout holds no `123-a`, and the new change is numbered `124`

#### Scenario: No manual done
- **WHEN** a human runs `osq done 123 1 --manual reason`
- **THEN** osq fails with an unknown command and writes no marker

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/spec-lint-and-approve/spec.md`: modifies "Approval into a worktree" and "Stacked approval"; adds "Checkout copy removed at approval", "Stacked draft restore", and "Change references across trees".
- `specs/cli-foundation/spec.md`: modifies "Land command"; adds "Change numbers across trees"; removes "Manual task completion command".
- `specs/status-inspection/spec.md`: modifies "Running change in status" and "Change location readers"; removes "Leftover draft in status".
- `specs/version-control/spec.md`: modifies "Land cleanup" and "Land from the verified tree".
- `specs/watcher-and-harness/spec.md`: modifies "Code ownership", "Lifecycle commands in a worktree", "Rejection under version control", "Squash commit message", and "Manual task completion lifecycle event".

Five tasks, no shared file. Task 1 comes first so that lint and numbering
no longer need the checkout's copy. Task 2 stops status and land from
reading the copy while approval still leaves it, and its tests no longer
touch it. Task 3 then makes approval remove it. Task 4 removes `osq done`.
Task 5 updates ADR 003, AGENTS.md, README, and CHANGELOG last.
