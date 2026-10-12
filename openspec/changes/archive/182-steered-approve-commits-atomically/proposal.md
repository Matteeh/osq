---
title: A steered approve seals and commits together, or leaves no seal behind
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - metrics-and-reporting
    - status-inspection
---
## Goal

Approving a revised plan in a worktree either seals and commits the change
folder, or leaves no seal behind, so a human never runs git to recover from a
half-done re-approval.

On 2026-10-11 the re-approval of 173 wrote its seal in the worktree but made no
`osq: 173 approved` commit. `osq retry 173 3` was accepted because the folder
hash matched the seal, and the watcher halted the change with `worktree_dirty`.

Cause, confirmed while planning on 2026-10-12: writing the seal wakes the
watcher. Each cycle runs `catchUpWorktreeCommits`, which reads `git status` in
the same worktree. Plain `git status` refreshes the index and holds
`index.lock` while it writes. In a scratch repository, `git add` running next to
a `git status` loop failed 837 times in 6015 runs with
`Unable to create '.../index.lock': File exists`. With `GIT_OPTIONAL_LOCKS=0`
on the status side, it failed 0 times in 7921 runs, and status no longer
rewrote the index.

This change makes three fixes, one per layer:

- osq's git calls run with `GIT_OPTIONAL_LOCKS=0`, so the watcher's reads no
  longer hold the lock that approve's commit needs.
- When the approved commit still fails, the steered approve puts its seal
  files back and says to run approve again.
- `osq retry` refuses while plan edits sit uncommitted in the worktree.

## Verify

`pnpm verify`

The CLI and UI typechecks, the build, every test and lint pass on the final
tree, including the four new test files named in the tasks.

## Non-goals

- Changing the non-steered approve path, which commits on the default branch.
- Changing steering triggers or `osq plan`.
- Changing the watcher's automatic retries or the trigger retirement inside
  approve; both call `retrySpec` directly.
- Unstaging what a failed commit's `git add` staged; the next approve stages
  the folder again.
- A new config key or retry loop for the commit lock.

## Surface

None

## Decisions

- ADR 002: archive's delta application is untouched.
- ADR 004: the OpenSpec validator invocation is untouched.
- ADR 005: the peer range rule is untouched.
- ADR 010: the validator role is untouched.
- ADR 012: the watch service is untouched; only the environment of its git reads changes.

## Assumptions

- `GIT_OPTIONAL_LOCKS=0` covers the clash the brief asks about: the watcher's git calls in a worktree are reads, except its own commits for dead or done tasks, which it makes only after a task ends. That is why approve gets no lock retry loop and no new timeout key.
- The retry refusal counts every path in the change folder except `tasks.md` and `.run/`, matching what the watcher's `worktree_dirty` check tolerates. `tasks.md` is left out although the brief lists it, because the watcher writes it during a run and it is routinely uncommitted.
- Turning optional locks off for every git call also means osq's reads in the human's checkout no longer refresh its index. Git refreshes the index on the human's own next command.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/version-control/spec.md`: MODIFIED "Vcs port" adds `GIT_OPTIONAL_LOCKS=0` and the scenario "Status leaves the index alone".
- `specs/spec-lint-and-approve/spec.md`: MODIFIED "Approval after steering" adds the rollback and the scenario "Approved commit fails".
- `specs/watcher-and-harness/spec.md`: ADDED "Retry refuses uncommitted plan edits"; MODIFIED "Task failures recover to a landed change" adds the scenario "Approval commit failed".

No file is shared between tasks.
