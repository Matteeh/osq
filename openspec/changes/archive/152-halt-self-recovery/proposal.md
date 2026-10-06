---
title: osq recovers from its own failed records without hand git
depends_on: []
verify: pnpm verify
features:
  reads: [status-inspection, metrics-and-reporting]
---
## Goal

When osq fails to record its own work, it recovers without a human running
git. A dead or verified task whose commit failed is committed again by the
watcher on the next cycle, and the `commit_failed` halt clears by itself when
that works. A merge of the default branch that changes a done task's files no
longer halts the change when the task's verify still passes. `osq approve`
run inside an osq worktree approves from the checkout. The shared-file
approval flag says what the watcher really does, and git's unlimited output
buffer gets a requirement.

In 149, recovering needed `git add -N`, `diff`, `checkout` and `rm` by hand,
a second halt after every task was done, and a second approve from another
directory. ADR 006 says a human only steers plans or taps decisions.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new
`tests/commit-catch-up.test.ts` drives the watcher through failed dead and
verified commits and checks the catch-up, its budget and its event.
`tests/vcs-sync-recertify.test.ts` checks that a sync recertifies a done task
whose files only the merge changed, and that the change then archives.
`tests/approve-from-worktree.test.ts` runs `osq approve` inside a worktree.
`tests/approval-digest-shared-wording.test.ts` checks the new flag text, and
`tests/git-output-buffer.test.ts` already covers the buffer.

## Non-goals

- Changing what counts as a scope regression for edits made outside a sync.
- Retrying a failed commit forever: after `gates.commitRetries` failed
  catch-ups the change stays halted until `osq retry <id> change`.
- Syncs with `skipVerify`, which approval after a default-branch trigger runs:
  they run no verify, so they recertify nothing, and the audit judges those
  tasks as it does today.
- Making any command other than `osq approve` move to the checkout.

## Surface

- Added: `gates.commitRetries` config key, defaulting to 2.
- Changed: a `commit_failed` halt clears by itself after a successful catch-up, recorded as a `retry` event for target `change` with `automatic: true`.
- Changed: a sync of an active change appends an automatic `recertification` event to a done task's stream, with attribution `sync` for each differing path.
- Changed: `osq approve` run inside an osq worktree prints `Approving from the checkout <path>` to stderr and approves from there.
- Changed: the `shared_file` approval flag's text.

## Decisions

- ADR 001: `gates.commitRetries` loads through the existing config loader; `osq approve` loads the checkout's config the same way.
- ADR 002: unaffected; archive applies deltas as before.
- ADR 004: unaffected.
- ADR 005: unaffected.
- ADR 010: unaffected; the validator still runs once at archive.
- ADR 003: the catch-up and the sync's recertification are commits osq makes
  on the change's own branch, which ADR 003 already allows; no human runs git.

**Approve resolves to the checkout instead of refusing.** Every write
`osq approve` makes is planned from the project root it is given, and the
worktree's checkout is the main entry of `git worktree list`. Running the same
command function with the checkout as `cwd` and the checkout's config is
exactly what a human would do by hand, so nothing new can go wrong. A refusal
would only add a step. A linked worktree that is not on an `osq/` branch is
left alone, since that may be the human's own checkout.

**Catch-up budget.** A failed commit is usually a hook, a lock file or an osq
bug. The first two pass on a later try; an osq bug fails every time until osq
is fixed. `gates.commitRetries` (default 2) bounds the automatic tries counted
since the last human `osq retry <id> change`, so a broken osq halts after
three failures in all and stays halted. Counting only since a human retry
keeps the watcher's own automatic retries from resetting the budget.

**Recertify in the sync, not the audit.** Step 5 of a sync already re-runs the
verify of every done task on the merged tree. When a task's scope matched its
done record just before the merge, any difference afterwards came from the
merge, so the sync refreshes the done marker right there, in the same commit.
The audit in `src/watcher/regression.ts` is unchanged (it is at 249 of 250
lines). A done task whose verify fails after the merge already stops the sync
with `sync_verify_red` and `verify of task <n> failed on osq/<folder> merged
with <default branch>`, which names the sync.

## Contract

### Requirement: Commit failure catch-up

The watcher SHALL commit a dead or verified task record that failed to commit
on a later cycle, and clear the `commit_failed` halt when that works.

#### Scenario: Dead commit caught up
- **WHEN** a task's dead commit fails on a `pre-commit` hook, the hook is removed, and a watcher cycle runs
- **THEN** the branch gains the dead commit, the halt is kept as `.run/regressed/change.1.md`, and `change.jsonl` gains a `retry` event for target `change` with `automatic: true`

#### Scenario: Budget spent
- **WHEN** the hook keeps rejecting and `gates.commitRetries` is 2
- **THEN** after three `commit_failed` halts no later cycle tries the commit until `osq retry <id> change`

### Requirement: Sync recertifies done tasks

A sync SHALL recertify a done task whose files only the merge changed, when
its verify passes on the merged tree.

#### Scenario: Main changes a done task's file
- **WHEN** task 1 of an active change is done, the default branch changes a file in its scope, and the sync's verify of task 1 passes
- **THEN** the sync commit holds task 1's refreshed done marker and an automatic `recertification` event with attribution `sync`, and the next scope audit finds nothing stale

### Requirement: Approve from a worktree

`osq approve` run inside an osq worktree SHALL approve from the checkout.

#### Scenario: Run in the worktree
- **WHEN** a human runs `osq approve 002` inside the worktree of `001`
- **THEN** the result equals running it from the checkout, and stderr names the checkout

## Human steps

### Before approval

- Land 151 first: `osq land 151`. 151 changed `src/core/vcs/sync-verify.ts`, `src/watcher/loop.ts` and `src/watcher/worktree-run.ts`, which tasks 1 and 2 build on.

### After landing

- Run `pnpm build` and restart `osq watch`; the watcher runs the code it loaded at start.

## Delta

- `specs/watcher-and-harness/spec.md`: removes "Commit failure"; adds "Commit failure catch-up"; modifies "Dead task record", which now removes a stale patch first.
- `specs/version-control/spec.md`: adds "Sync recertifies done tasks" and "Git output has no size limit".
- `specs/spec-lint-and-approve/spec.md`: adds "Approve from a worktree"; modifies "Approval flags" for the shared-file text.
- `specs/cli-foundation/spec.md`: adds "Commit catch-up gate key".

Four tasks, in order, sharing no file. Task 1 adds the commit catch-up and
its gate key. Task 2 adds the sync's recertification. Task 3 makes approve
resolve to the checkout. Task 4 fixes the flag text, records the buffer
requirement, and documents tasks 1 and 2 in the README.

## Background

**Where commits fail today.** `commitWorktreeDeadTask` and
`commitWorktreeVerifiedTask` in `src/watcher/worktree-commit.ts` return a
`commit_failed` halt that `haltWorktreeChange` records. While
`.run/regressed/change.md` exists, `runWatcherCycle` in `src/watcher/loop.ts`
skips `commitPendingVerifiedTasks`, so nothing commits again until a human
retry. Nothing ever re-commits a dead record: `pendingDoneTasks` only looks at
`.run/done/`. A dead record that did not commit leaves the agent's edits in the
worktree, so `checkWorktree` then halts with `worktree_dirty`.

**Why the catch-up runs before automatic retries.** `runAutomaticRetries`
renames `.run/dead/<n>.md` to `.run/dead/<n>.<k>.md`. Run first, the
uncommitted canonical marker is what marks the record as pending.

**Why the old patch is removed first.** `patch()` diffs the whole worktree,
the change folder's untracked files included. A `.run/dead/<n>.patch` left by
a failed try would be copied into the new patch, and each try would grow it,
as 149's halt detail did.

**Clearing the halt.** `retrySpec` in `src/core/lifecycle/retry.ts` with
target `change` and `{ automatic: true }` keeps the marker as
`.run/regressed/change.<k>.md` and appends the `retry` event, exactly as a
human retry does, only with `automatic: true`. `runAutomaticRetries` in
`src/watcher/auto-retry.ts` already calls it this way from the worktree root.

**Sync.** `syncVerifyTasks` in `src/core/vcs/sync-verify.ts` runs in
`prepareSync`, before the merge, so it can hash each done task's scope with
`computeTaskScopeHash` there. `readDoneMarker` returns null for a done marker
without `scope_hash`, such as a manual one, and those tasks are left alone.
`refreshRecertifiedDoneMarker` in `src/core/lifecycle/recertify.ts` rewrites a
done marker the way `autoRecertify` does. `src/core/vcs/sync-main.ts` is at
242 of 250 lines.

**Approve.** `approveCommand` in `src/cli/approve.ts` takes `inputs.cwd` as
the project root for `approveSpec`, `findChange` and `readNextStep`.
`Vcs.worktreeList()` returns `git worktree list`, whose first entry is the
main worktree.
