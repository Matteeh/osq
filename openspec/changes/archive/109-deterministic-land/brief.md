---
queue_item: deterministic-land
queue_hash: sha256:e6c44b205c1c148bf1cdc77092868dab70a48b099e88918a6d53e166298ab790
planner: null
date: 2026-09-28
---

### Goal

`osq land <id>` either lands the change completely or changes nothing. osq builds the land commit from the tree the watcher verified and fast-forwards the default branch to it, so the squash can't conflict in the checkout, a failed commit can't leave a squash staged, and unrelated uncommitted work in the checkout doesn't block a land. The hand-landing path goes, as ADR 006 retires it.

### Context

As of 2026-09-28:

- `landChange` in `src/core/vcs/land.ts` (227 lines, cap 250) runs `git merge --squash` in the checkout through `Vcs.merge(ref, true)`, then `Vcs.commit`. It refuses any modified tracked file (`assertCheckoutClean` in `src/core/vcs/land-checks.ts`), checks again that the default branch hasn't moved (`assertStillLandable`), aborts a squash that conflicts, and when the commit fails it leaves the squash staged and prints `osq message <id> | git commit -F -` or `git reset --merge`.
- When the default branch has moved, `syncWithDefaultBranch` in `src/core/vcs/sync-main.ts` first merges it into the branch in the change's worktree, rebuilds the living specs, and runs verify there. After that the branch contains the default branch, so its tip's tree is exactly the tree to land.
- When the default branch hasn't moved, `landChange` runs the proposal's `verify` again through `runLandVerify`. The archive verification in `src/watcher/archiver.ts` runs every task verify and the change verify before `archiveSpecFolder` applies the deltas, so the spec-merged tree is never verified. That is all the land verify adds today. On 107 it would have been the sixth `pnpm verify`.
- A prototype on 2026-09-28, in a scratch repository: `git commit-tree <branch tip>^{tree} -p <default branch>`, then `git merge --ff-only` in the checkout. It landed with an unrelated modified file and an untracked draft left in place. With a modified file the change also touches, git refused and the default branch didn't move.
- ADR 003 decision 7 describes the squash in the checkout, and decision 8 says osq runs commit hooks. `git commit-tree` runs no hooks.
- README's "Working with version control on" step 5 and the code block above it, the `Land:` line `osq message` prints on stderr, and the staged-squash message all describe landing by hand.

### Requirements

- osq builds the land commit from the branch tip's tree, with the default branch as its only parent, `vcs.author` as its author, and the message `osq message <id>` prints. Building it touches no working tree and no index.
- The checkout moves to the new commit only by a fast-forward. When git refuses because an uncommitted file in the checkout is one the change touches, the default branch stays where it was and osq names the files.
- `osq land` no longer refuses unrelated uncommitted changes in the checkout. It still refuses a checkout that isn't on the default branch.
- If the default branch moves between the sync and the fast-forward, the land stops with the default branch unchanged and says to run `osq land <id>` again.
- The archive runs the change-level `verify` after applying the deltas instead of before, so the archived tree is a verified tree. Task verifies still run before. `osq land` then runs `verify` only when the sync merged new commits.
- The hand-landing path goes: README's step 5 and its code block, the `Land:` line on `osq message`'s stderr, and the staged-squash message. `osq message <id>` still prints the message on stdout.
- ADR 003 decisions 7 and 8 describe the new land: built from the verified tree, fast-forwarded, and the land commit runs no commit hooks.
- While it works, `osq land` says what it is doing. When the default branch has moved, it prints one line before the sync, naming how many commits it is taking in and that it will run the change's `verify`, before it goes quiet.
- The sync and its `verify` leave a record: `osq land` appends events for the sync and for the `verify` it ran, with the command, exit code and duration, to the change's `.run/events/`, as the watcher does for its own verify runs.

### Why the two lines above

Landing 108 on 2026-09-28 took close to a minute and printed nothing. `main` had moved by two commits, so `osq land` merged it into the branch and ran the whole `pnpm verify` on the merged tree before committing, which is right, but it looked stuck. The run left no event either: the timing had to be reconstructed from temporary folders the test suite left in `/tmp`. Once `osq-sync` merges the default branch before archive, and this change skips `verify` when nothing was merged, most lands should be near-instant, and the wait only happens when the default branch moved after archive. When it does happen, it should be visible and recorded.

### Decide before planning

- Whether `git commit-tree` honours `commit.gpgSign` in the git versions osq supports. If it doesn't, osq passes `-S` when the setting is on, because ADR 003 decision 8 says osq never disables signing.
- Whether a red change verify after the delta merge reuses `.run/regressed/change.md` or needs its own reason.

### Non-goals

- Landing without an id, or several changes at once.
- Landing automatically after archive.
- Pushing.
- Removing the leftover-draft handling. `approve-owns-draft` stops creating leftovers.

### Notes for planning

- The squash path, the staged-squash branch and `assertStillLandable` go, so `land.ts` should shrink.
- `tests/vcs-land.test.ts` and `tests/vcs-land-refusals.test.ts` pin the dirty-checkout refusal and the hook message. Measure the fallout in a scratch worktree before writing scope.
- The `Vcs` port gains an operation that builds the commit and one that fast-forwards. Write their signatures in the task, as for any port.
- Change 107 left two duplicates in the code this change rewrites: `outputTail` is defined in both `land-checks.ts` and `sync-main.ts`, and `runLandVerify` in `land-checks.ts` and `runSyncVerify` in `sync-main.ts` are nearly identical. Keep one of each.
