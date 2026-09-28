## ADDED Requirements

### Requirement: Vcs merge operations
The `Vcs` port SHALL also offer `merge`, `mergeAbort`, `stage`, and
`isAncestor`. `merge(ref, squash)` SHALL run `git merge --no-ff --no-commit
<ref>` when `squash` is false, leaving the merge uncommitted, and
`git merge --squash <ref>` when it is true. It SHALL return `clean` with an
empty path list, or `conflict` with the unmerged paths, relative to the
project root and sorted. When git refuses to start the merge, as over local
changes or an untracked file the merge would overwrite, `merge` SHALL fail
with git's output and leave the tree and the index as they were.
`mergeAbort()` SHALL run `git merge --abort`. `stage(paths)` SHALL stage
exactly the given paths, including deletions. `isAncestor(ancestor,
descendant)` SHALL be true when `ancestor` is `descendant` or one of its
ancestors, and false otherwise, including for a ref that does not exist.
Under `NoVcs`, `isAncestor` SHALL return false, and `merge`, `mergeAbort`, and
`stage` SHALL fail naming the reason git is off.

#### Scenario: Clean merge left uncommitted
- **WHEN** branch `side` changes `b.txt`, `main` changes `a.txt`, and `merge('side', false)` runs on `main`
- **THEN** it returns `clean`, both changes are in the tree and staged, and HEAD is unchanged until `commit` with no paths makes a commit whose parents are the old HEAD and `side`

#### Scenario: Conflict and abort
- **WHEN** `main` and `side` both change the same line of `a.txt` and `merge('side', false)` runs on `main`
- **THEN** it returns `conflict` with `['a.txt']`, and after `mergeAbort` HEAD is unchanged and `status` is empty

#### Scenario: Squash of a branch that contains HEAD
- **WHEN** branch `side` was cut from `main`'s tip and has two more commits, and `merge('side', true)` runs on `main`
- **THEN** it returns `clean`, HEAD is unchanged, and `commit` with no paths makes one commit whose only parent is the old HEAD and whose tree equals `side`'s tip

#### Scenario: Untracked file in the way
- **WHEN** `side` adds `c.txt` and the checkout has an untracked `c.txt`
- **THEN** `merge('side', true)` fails, and the untracked `c.txt` and the index are unchanged

#### Scenario: Ancestry
- **WHEN** `side` was cut from `main` and has one more commit
- **THEN** `isAncestor('main', 'side')` is true, `isAncestor('side', 'main')` is false, `isAncestor('main', 'main')` is true, and `isAncestor('missing', 'main')` is false

### Requirement: Default branch sync
`syncWithDefaultBranch` in `src/core/vcs/sync-main.ts` SHALL take the default
branch into an archived change's branch, in the change's worktree, and report
whether it merged. When the default branch's tip is already an ancestor of the
worktree's HEAD, it SHALL write nothing and report no merge. Otherwise it SHALL
work in this order, and every stop SHALL leave the worktree's HEAD where it
was, with an empty `status`:

1. Before writing anything, for every capability with a delta in the archived
   folder, it SHALL compare every requirement the delta names under
   `## MODIFIED Requirements` or `## REMOVED Requirements`, or as a
   `## RENAMED Requirements` source, between the living spec at the commit in
   `.run/base` and the living spec at the default branch's tip. It compares the
   requirement's full text as `parseCapabilitySpec` returns it. When any of
   them differs or is missing on the default branch, it SHALL stop with
   `<folder>: <default branch> changed requirements this change rewrites since
   it was approved: <capability>: <requirement>, ...; reject the change and
   plan it again against <default branch>`.
2. It SHALL merge the default branch without committing. A conflict at any
   path other than the living `spec.md` of a capability the change's deltas
   write SHALL abort the merge and stop with `<folder>: <paths, comma-separated>
   conflict with <default branch>; merge it into osq/<folder> by hand in
   <worktree>, then run osq land <id> again`.
3. For every capability the change's deltas write, it SHALL put the default
   branch's copy of the living spec in place, or remove the file when the
   default branch has none, then apply the archived folder's deltas with
   `applyOpenSpecDeltas`, the function archive uses, and stage those files.
   A delta that no longer applies SHALL abort the merge and stop with the
   merge error's message.
4. It SHALL run `vcs.prepare` in the worktree when it is set, as approval
   does. A failure SHALL abort the merge and stop with its output.
5. It SHALL run the proposal's `verify` in the worktree through
   `runVerificationCommand`, with no `OSQ_CHANGE`, bounded by
   `timeouts.verifyTimeoutSeconds`. A failure SHALL abort the merge and stop
   with `<folder>: verify failed on osq/<folder> merged with <default branch>:`
   and the last `limits.cardOutputLines` lines of its output.
6. It SHALL commit the merge with no paths, authored by `vcs.author`, with the
   message `osq: <id> sync <default branch>`, a blank line, and
   `Osq-Change: <folder>`. A failed commit SHALL abort the merge and stop with
   git's output.

#### Scenario: Already current
- **WHEN** the default branch has not moved since the branch was cut
- **THEN** the sync reports no merge and the branch tip is unchanged

#### Scenario: Both add to one capability
- **WHEN** changes `001` and `002` were cut from the same default branch, both add a requirement to capability `orders`, `001` has landed, and `002`'s branch holds `002`'s archive
- **THEN** the sync commits `osq: 002 sync main`, and `orders`'s living spec on the branch equals `applyOpenSpecDeltas` of `002`'s delta over the default branch's copy, holding both requirements with no conflict marker

#### Scenario: Requirement changed on the default branch
- **WHEN** `002` modifies requirement `Order totals`, and a change that landed after `002` was approved also modified it
- **THEN** the sync stops naming `orders: Order totals`, and the worktree's HEAD and status are unchanged

#### Scenario: Code conflict
- **WHEN** the default branch and `002` both changed the same line of `src/app.txt`
- **THEN** the sync stops naming `src/app.txt`, and the worktree's HEAD and status are unchanged

#### Scenario: Red verify after the merge
- **WHEN** the merged tree makes the proposal's `verify` exit 1 after printing `broken`
- **THEN** the sync stops with the verify line and output holding `broken`, and the worktree's HEAD and status are unchanged

### Requirement: Land refusals
`landChange` in `src/core/vcs/land.ts` SHALL refuse, writing nothing, in this
order:

- With `vcs.enabled` off or `NoVcs` selected: `osq land needs vcs.enabled and
  git`.
- Every refusal of "Squash commit message" for the id, with its message,
  unless the change has already landed, as "Land cleanup" says.
- When the checkout's HEAD is not on the default branch: `osq land runs on
  <default branch>; the checkout is on <branch>`, or `on a detached HEAD`.
- When the checkout's `status` lists any entry other than an untracked one:
  `The checkout has uncommitted changes: <paths>; commit or stash them first`.
- When the worktree's `status` lists any entry: `<worktree> has uncommitted
  changes: <paths>; commit or discard them first`.
- When another change that archived in an osq worktree and has not landed has
  an earlier `archived` event than this change, as `readLandedAt` reads it,
  and writes a delta for a capability this change also writes: `<other folder>
  archived before <folder> and also writes <capabilities>; land it first, or
  reject it`. A change with no `archived` event SHALL not be compared.

#### Scenario: Modified tracked file
- **WHEN** the checkout has a modified tracked file `README.md` and an untracked draft folder
- **THEN** `osq land` refuses naming `README.md` and nothing else, and writes nothing

#### Scenario: Untracked draft only
- **WHEN** the checkout's only change is an untracked draft folder of another change
- **THEN** `osq land` lands the change

#### Scenario: Off the default branch
- **WHEN** the checkout is on branch `feature`
- **THEN** `osq land` refuses with `osq land runs on main; the checkout is on feature`

#### Scenario: Edited worktree
- **WHEN** the change's worktree has an untracked file `notes.txt`
- **THEN** `osq land` refuses naming `notes.txt`, and writes nothing

#### Scenario: Earlier change shares a capability
- **WHEN** `001` and `002` both archived and neither has landed, `001` archived first, both write `orders`, and `osq land 002` runs
- **THEN** it refuses with `001-<words> archived before 002-<words> and also writes orders; land it first, or reject it`

#### Scenario: Earlier change on other capabilities
- **WHEN** `001` archived first and writes only `billing`, and `002` writes only `orders`
- **THEN** `osq land 002` lands `002`

### Requirement: Land
After the refusals, `landChange` SHALL run `syncWithDefaultBranch` for the
change and stop with its message when it stops. When the sync reports no
merge, it SHALL run the proposal's `verify` in the worktree the same way, and
stop with `<folder>: verify failed on osq/<folder>:` and the same output tail
when it fails. It SHALL then check again that the checkout's HEAD is on the
default branch, that its `status` lists only untracked entries, and that the
default branch's tip is an ancestor of the worktree's HEAD, and otherwise stop
with `<default branch> moved while landing; run osq land <id> again`. It SHALL
then squash-merge `osq/<folder>` into the checkout and commit with no paths,
authored by `vcs.author`, with the message "Squash commit message" builds at
that moment. When the commit fails, it SHALL print git's output, then
`The squash is staged. Finish with: osq message <id> | git commit -F -`, then
`Or undo it with: git reset --merge`, and exit one. On success it SHALL print
`Landed <folder> as <commit>`, clean up as "Land cleanup" says, print
`Kept branch osq/<folder>`, and exit zero. It SHALL never push.

#### Scenario: Land after archive
- **WHEN** a change approved into a worktree has archived and the default branch has not moved
- **THEN** `osq land <id>` makes one commit on the default branch whose tree equals the branch tip and whose message equals what `osq message <id>` printed before, whose `Osq-Head` is the branch tip, and whose author is `vcs.author`; the leftover draft and the worktree are gone, and `osq/<folder>` still exists

#### Scenario: Two changes land in order
- **WHEN** `001` and `002` were cut from the same default branch and both add a requirement to `orders`, and `osq land 001` then `osq land 002` run
- **THEN** both succeed, `orders`'s living spec equals applying `001`'s delta and then `002`'s to the original spec, `osq/002-<words>` holds `osq: 002 sync main`, and the second commit's `Osq-Head` is that sync commit

#### Scenario: Stop leaves the checkout alone
- **WHEN** the sync stops on a code conflict
- **THEN** `osq land` exits one with the sync's message, and the checkout's HEAD and status are what they were

#### Scenario: Hook rejects the land commit
- **WHEN** the checkout's `pre-commit` hook exits 1 with `blocked by hook`
- **THEN** `osq land` exits one, prints `blocked by hook` and both lines on how to finish or undo, the squash is staged, and HEAD is unchanged

### Requirement: Land cleanup
After a land commit, and for a change the default branch already holds,
`landChange` SHALL remove the change's leftover draft when `findLeftoverDrafts`
lists it, printing `Removed leftover draft <path>`. It SHALL then remove the
worktree at the path "Worktree location" gives when `worktreeList` lists it,
printing `Removed worktree <path>`. When `worktreeRemove` fails, it SHALL print
`Kept worktree <path>:` and git's output, and still exit zero. When `osq land
<id>` names a change the default branch already holds, as `readDependencyState`
reads it, it SHALL print `<folder> has already landed`, clean up, and exit
zero. When nothing is left to remove, it SHALL print `<folder> has already
landed; nothing to clean up`.

#### Scenario: Landed by hand, worktree kept
- **WHEN** a change was landed with `git merge --squash` and `osq message <id> | git commit -F -`, and its worktree and leftover draft remain
- **THEN** `osq land <id>` prints `<folder> has already landed`, removes both, and makes no commit

#### Scenario: Nothing to clean up
- **WHEN** `osq land <id>` runs again for the same change
- **THEN** it prints `<folder> has already landed; nothing to clean up` and exits zero

#### Scenario: Edited leftover copy is kept
- **WHEN** the checkout's copy of the change was edited after approval
- **THEN** `osq land` lands the change and leaves the copy in place
