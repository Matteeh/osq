## ADDED Requirements

### Requirement: Vcs land operations
The `Vcs` port SHALL also offer `commitTree`, `fastForward`, and
`countCommits`. `commitTree(source, parent, message, author)` SHALL write a
commit whose tree is the tree of commit `source`, whose only parent is
`parent`, whose message is `message`, passed to git in a file and never as an
argument, and whose author is `author`, with git's configured identity as
committer, and return the new commit. It SHALL change no working tree, no
index, and no ref, and run no hook. When `git config --type=bool --get
commit.gpgSign` prints `true`, it SHALL pass `-S`, because `git commit-tree`
ignores that setting. `fastForward(commit)` SHALL first collect every `status`
entry whose path, or whose old path for a rename or copy, `commit` changes
relative to HEAD. When there is any, it SHALL return `blocked` with those
paths, relative to the project root and sorted, and run no write. Otherwise it
SHALL run `git merge --ff-only <commit>` and return `done` with an empty list,
and when git refuses it SHALL fail with git's output, leaving HEAD, the index,
and the tree as they were. `commitTree` and `fastForward` SHALL be bounded by
`timeouts.gitCommitSeconds`. `countCommits(from, to)` SHALL return how many
commits `to` has that `from` lacks, and 0 when either ref does not exist.
Under `NoVcs`, `countCommits` SHALL return 0, and `commitTree` and
`fastForward` SHALL fail naming the reason git is off.

#### Scenario: Commit from a branch's tree
- **WHEN** branch `side` was cut from `main` and has two more commits, the checkout on `main` has a modified tracked file and a staged file, and `commitTree('side', 'main', message, 'osq <osq@example.invalid>')` runs
- **THEN** the new commit's tree equals `side`'s tip tree, its only parent is `main`'s tip, its author is `osq <osq@example.invalid>`, its message is `message`, and HEAD, `main`, `indexDigest`, and `status` are unchanged

#### Scenario: Commit tree runs no hook
- **WHEN** the repository's `pre-commit` hook exits 1 and `commitTree` runs
- **THEN** it returns a commit

#### Scenario: Commit tree signs when git is set to
- **WHEN** `commit.gpgSign` is true and `gpg.program` names a script that records its call and prints a signature
- **THEN** `commitTree`'s commit carries a `gpgsig` header and the script ran

#### Scenario: Fast-forward past unrelated work
- **WHEN** the checkout on `main` has a modified tracked `a.txt`, a staged `s.txt`, and an untracked `drafts/x`, and `fastForward` names a commit whose parent is HEAD and which changes only `b.txt`
- **THEN** it returns `done`, HEAD is that commit, `b.txt` matches it, `a.txt` is still modified, `s.txt` is still staged, and `drafts/x` remains

#### Scenario: Uncommitted file the commit changes
- **WHEN** the checkout has a modified tracked `b.txt` and `fastForward` names a commit that changes `b.txt`
- **THEN** it returns `blocked` with `['b.txt']`, and HEAD and `b.txt` are unchanged

#### Scenario: Not a fast-forward
- **WHEN** `main` has a commit that the named commit does not contain
- **THEN** `fastForward` fails with git's output and HEAD is unchanged

#### Scenario: Counting commits
- **WHEN** `side` has two commits `main` lacks
- **THEN** `countCommits('main', 'side')` is 2, `countCommits('side', 'main')` is 0, and `countCommits('missing', 'main')` is 0

### Requirement: Land from the verified tree
After the refusals, `landChange` SHALL run `syncWithDefaultBranch` for the
change, passing on its progress callback, and stop with the sync's message
when it stops. It SHALL run no other `verify`: when the sync reports no merge,
the branch tip is the tree archive verified. It SHALL then take the worktree's
HEAD as the tip and the checkout's HEAD as the base, and stop with `<default
branch> moved while landing; run osq land <id> again` when the base is not an
ancestor of the tip. It SHALL build the land commit with `commitTree(tip,
base, message, vcs.author)`, where the message is what "Squash commit
message" builds at that moment, and move the checkout to it only through
`fastForward`. When `fastForward` returns `blocked`, it SHALL stop with `The
checkout has uncommitted changes in files this land writes: <paths>; commit or
stash them, then run osq land <id> again`. When `fastForward` fails and the
checkout's HEAD is no longer the base, it SHALL stop with the moved message,
and on any other failure with git's output. Every refusal and stop SHALL leave
the default branch, the checkout's index, and its tree as they were. On
success it SHALL print `Landed <folder> as <commit>`, clean up as "Land
cleanup" says, print `Kept branch osq/<folder>`, and exit zero. It SHALL never
push.

#### Scenario: Land after archive
- **WHEN** a change approved into a worktree has archived and the default branch has not moved
- **THEN** `osq land <id>` makes one commit on the default branch whose only parent is the old tip, whose tree equals the branch tip, whose message equals what `osq message <id>` printed before, whose `Osq-Head` is the branch tip, and whose author is `vcs.author`; the leftover draft and the worktree are gone, and `osq/<folder>` still exists

#### Scenario: Two changes land in order
- **WHEN** `001` and `002` were cut from the same default branch and both add a requirement to `orders`, and `osq land 001` then `osq land 002` run
- **THEN** both succeed, `orders`'s living spec equals applying `001`'s delta and then `002`'s to the original spec, `osq/002-<words>` holds `osq: 002 sync main`, and the second commit's `Osq-Head` is that sync commit

#### Scenario: Stop leaves the checkout alone
- **WHEN** the sync stops on a code conflict
- **THEN** `osq land` exits one with the sync's message, and the checkout's HEAD and status are what they were

#### Scenario: Unrelated uncommitted work stays
- **WHEN** the checkout has a modified tracked `README.md`, a staged `notes.txt`, and an untracked draft folder of another change, none of which the change touches
- **THEN** `osq land` lands the change, `README.md` is still modified, `notes.txt` is still staged, and the draft folder remains

#### Scenario: Uncommitted file the change writes
- **WHEN** the checkout has a modified tracked file that the change also changes
- **THEN** `osq land` exits one with the uncommitted-files stop naming that file, the default branch has not moved, and the file keeps its edit

#### Scenario: Default branch moves during the land
- **WHEN** a commit lands on the default branch while the sync runs
- **THEN** `osq land` exits one with `main moved while landing; run osq land <id> again`, and the default branch is at that commit with no land commit on it

#### Scenario: Land commit runs no hook
- **WHEN** the repository's `pre-commit` hook exits 1 with `blocked by hook`
- **THEN** `osq land` lands the change, and its output does not hold `blocked by hook`

#### Scenario: No verify without a merge
- **WHEN** the default branch has not moved since archive and the proposal's `verify` would now exit 1
- **THEN** `osq land` lands the change without running it

## MODIFIED Requirements

### Requirement: Default branch sync
`syncWithDefaultBranch` in `src/core/vcs/sync-main.ts` SHALL take the default
branch into an archived change's branch, in the change's worktree, and report
whether it merged. It SHALL take an optional progress callback. When the
default branch's tip is already an ancestor of the worktree's HEAD, it SHALL
write nothing, call no callback, and report no merge. Otherwise it SHALL work
in this order, and every stop SHALL leave the worktree's HEAD where it was,
with an empty `status`:

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
2. It SHALL call the progress callback once with `<default branch> has <n> new
   commits; merging into osq/<folder> and running verify: <command>`,
   where `<n>` is `countCommits` from the worktree's HEAD to the default
   branch, `commits` reads `commit` when `<n>` is 1, and the text from
   ` and running verify` is left out when the proposal has no `verify`. It
   SHALL then merge the default branch without committing. A conflict at any
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
   and the last `limits.cardOutputLines` lines of its output. When it passes,
   it SHALL append to the archived folder's `.run/events/change.jsonl` a
   `verify_ran` event whose data holds `command`, `exitCode`, `duration` in
   milliseconds, and `output` when the output is not blank, as the watcher's
   verify gate writes it. It SHALL then append a `synced` event whose data
   holds `defaultBranch`, `commits` (the `<n>` of step 2), and `duration`, the
   milliseconds from the merge's start to this step's end, and stage that
   file. Without a `verify`, only the `synced` event is appended.
6. It SHALL commit the merge with no paths, so the commit holds the staged
   events, authored by `vcs.author`, with the message `osq: <id> sync <default
   branch>`, a blank line, and `Osq-Change: <folder>`. A failed commit SHALL
   abort the merge and stop with git's output.

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

#### Scenario: Sync announces itself
- **WHEN** the default branch has one commit the branch lacks and `osq land <id>` runs
- **THEN** stderr holds `main has 1 new commit; merging into osq/<folder> and running verify: node verify.cjs` before the land's output

#### Scenario: Sync records its verify
- **WHEN** the sync merges and its `verify` passes
- **THEN** the sync commit's `.run/events/change.jsonl` in the archived folder ends with a `verify_ran` event holding the command, exit code 0, and a duration, then a `synced` event holding `main`, the commit count, and a duration

### Requirement: Land refusals
`landChange` in `src/core/vcs/land.ts` SHALL refuse, writing nothing, in this
order:

- With `vcs.enabled` off or `NoVcs` selected: `osq land needs vcs.enabled and
  git`.
- Every refusal of "Squash commit message" for the id, with its message,
  unless the change has already landed, as "Land cleanup" says.
- When the checkout's HEAD is not on the default branch: `osq land runs on
  <default branch>; the checkout is on <branch>`, or `on a detached HEAD`.
- When the worktree's `status` lists any entry: `<worktree> has uncommitted
  changes: <paths>; commit or discard them first`.
- When another change that archived in an osq worktree and has not landed has
  an earlier `archived` event than this change, as `readLandedAt` reads it,
  and writes a delta for a capability this change also writes: `<other folder>
  archived before <folder> and also writes <capabilities>; land it first, or
  reject it`. A change with no `archived` event SHALL not be compared.

Uncommitted changes in the checkout SHALL NOT refuse a land. "Land from the
verified tree" stops only for those in files the land writes.

#### Scenario: Modified tracked file
- **WHEN** the checkout has a modified tracked file `README.md` that the change does not touch, and an untracked draft folder
- **THEN** `osq land` lands the change, and `README.md` keeps its edit

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

## REMOVED Requirements

### Requirement: Land
**Reason**: Landing no longer squashes in the checkout or commits through `git commit`, so a failed commit cannot leave a squash staged. "Land from the verified tree" replaces it.
**Migration**: None. `osq land <id>` keeps its name and its success output.
