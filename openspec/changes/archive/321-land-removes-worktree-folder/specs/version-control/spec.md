## MODIFIED Requirements

### Requirement: Land cleanup
After a land commit, and for a change the default branch already holds,
`landChange` SHALL clean up the change's worktree at the path "Worktree
location" gives when a folder is there or `worktreeList` lists it, in this
order:

1. Copy the change folder's `.run/logs` from the worktree's archive into the
   same change folder in the checkout's archive, keeping any file already
   there.
2. Delete the worktree folder with every file in it, ignored files
   included, with no time limit.
3. Run `worktreePrune`.

When every step passes, it SHALL print `Removed worktree <path>`. When a step
fails, it SHALL run no later step, print `Could not remove worktree <path>:
<cause>`, where `<cause>` is the failing step's error message, keep the land
commit, and exit 1 after printing its other lines. It SHALL neither read nor
remove a folder of the change's name in the checkout. When `osq land <id>`
names a change the default branch already holds, as `readDependencyState`
reads it, it SHALL print `<folder> has already landed`, clean up, and exit
zero, or exit 1 when the cleanup fails. When nothing is left to remove, it
SHALL print `<folder> has already landed; nothing to clean up`.

#### Scenario: Landed by hand, worktree kept
- **WHEN** a change was landed with `git merge --squash` and `osq message <id> | git commit -F -`, and its worktree remains
- **THEN** `osq land <id>` prints `<folder> has already landed`, removes the worktree, and makes no commit

#### Scenario: Nothing to clean up
- **WHEN** `osq land <id>` runs again for the same change
- **THEN** it prints `<folder> has already landed; nothing to clean up` and exits zero

#### Scenario: Edited leftover copy is kept
- **WHEN** the checkout holds an untracked folder named like the change, as an approval before change 123 left behind, and the change lands
- **THEN** `osq land` lands the change, leaves that folder in place, and prints no line about it

#### Scenario: Ignored build output removed
- **WHEN** the change's worktree holds the ignored file `node_modules/pkg/index.js` and `osq land <id>` lands the change
- **THEN** it prints `Removed worktree <path>` and exits zero, no folder is left at `<path>`, and `git worktree list` no longer lists `<path>`

#### Scenario: Logs kept in the checkout
- **WHEN** the worktree's archived change folder holds `.run/logs/probe.log` holding `probe` and `osq land <id>` lands the change
- **THEN** the checkout's archived change folder holds `.run/logs/probe.log` holding `probe`, and `git status --porcelain` in the checkout prints nothing

#### Scenario: Removal fails after the land commit
- **WHEN** the worktree holds a folder `node_modules/locked` whose files the user cannot delete and `osq land <id>` lands the change
- **THEN** it prints `Landed <folder> as <commit>`, then `Could not remove worktree <path>: ` followed by an error naming `EACCES`, then `Kept branch osq/<folder>`, exits 1, and the default branch's HEAD is `<commit>`

#### Scenario: Leftover folder removed on the next land
- **WHEN** a change has landed and a folder that git no longer lists as a worktree is left at its worktree path, holding `target/big`
- **THEN** `osq land <id>` prints `<folder> has already landed` and `Removed worktree <path>`, exits zero, and no folder is left at `<path>`

## ADDED Requirements

### Requirement: Git timeout message
When `GitVcs` ends a git command at its time limit, the command's error
output SHALL end with `git <args> timed out after <n>s`, where `<args>` are
the command's arguments joined by spaces and `<n>` is the limit in seconds
as configured, so a write that fails on its time limit names it.

#### Scenario: Prune past its time limit
- **WHEN** `worktreePrune` runs with `timeouts.gitSeconds` set to `0.1` and a git binary that sleeps 5 seconds on `worktree prune`
- **THEN** it fails with an error whose message holds `git worktree prune timed out after 0.1s`
