## MODIFIED Requirements

### Requirement: Land cleanup
After a land commit, and for a change the default branch already holds,
`landChange` SHALL remove the worktree at the path "Worktree location" gives
when `worktreeList` lists it, printing `Removed worktree <path>`. When
`worktreeRemove` fails, it SHALL print `Kept worktree <path>:` and git's
output, and still exit zero. It SHALL neither read nor remove a folder of the
change's name in the checkout. When `osq land <id>` names a change the default
branch already holds, as `readDependencyState` reads it, it SHALL print
`<folder> has already landed`, clean up, and exit zero. When nothing is left
to remove, it SHALL print `<folder> has already landed; nothing to clean up`.

#### Scenario: Landed by hand, worktree kept
- **WHEN** a change was landed with `git merge --squash` and `osq message <id> | git commit -F -`, and its worktree remains
- **THEN** `osq land <id>` prints `<folder> has already landed`, removes the worktree, and makes no commit

#### Scenario: Nothing to clean up
- **WHEN** `osq land <id>` runs again for the same change
- **THEN** it prints `<folder> has already landed; nothing to clean up` and exits zero

#### Scenario: Edited leftover copy is kept
- **WHEN** the checkout holds an untracked folder named like the change, as an approval before change 123 left behind, and the change lands
- **THEN** `osq land` lands the change, leaves that folder in place, and prints no line about it

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
- **THEN** `osq land <id>` makes one commit on the default branch whose only parent is the old tip, whose tree equals the branch tip, whose message equals what `osq message <id>` printed before, whose `Osq-Head` is the branch tip, and whose author is `vcs.author`; the worktree is gone, the checkout holds the change only under the archive directory, and `osq/<folder>` still exists

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
