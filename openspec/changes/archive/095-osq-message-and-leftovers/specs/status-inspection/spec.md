## ADDED Requirements

### Requirement: Leftover draft in status
<!-- source: src/core/status/leftover-drafts.ts, src/core/status/status.ts, tests/status-leftover.test.ts -->
With `vcs.enabled` and `GitVcs` selected, a folder directly in the project
root's changes directory, from the first `changeTrees` tree, that passes
`isActiveChangeFolderName` SHALL be a leftover draft when the default branch
holds `<archive>/<folder>/.run/approved` and the folder's `hashChangeFolder`
hash equals that file's trimmed contents. `<archive>` is the first tree's
archive directory relative to its root. `getStatusOverview` SHALL leave a
leftover draft out of `specs` and SHALL list it in `leftovers`, with its
folder name and its path relative to the project root. When `leftovers` is
not empty, `osq status` SHALL print, after the pending verifications and
before `Archived specs:`, the line `Leftover drafts:`, then one line
`  <folder>: landed; remove the checkout copy with rm -r <path>` per
leftover in folder order, then a blank line. A copy whose hash differs from
the landed approved hash SHALL NOT be a leftover. With `vcs.enabled` off or
under `NoVcs`, there SHALL be no leftovers and no git read.

#### Scenario: Leftover after a hand landing
- **WHEN** a change approved into a worktree has archived, the checkout ran `git merge --squash osq/<folder>` and `git commit`, and the checkout's copy of the folder is untouched
- **THEN** `osq status` prints `Leftover drafts:` and `  <folder>: landed; remove the checkout copy with rm -r openspec/changes/<folder>`, and does not list the folder under `Active specs:`

#### Scenario: Leftover after the worktree is removed
- **WHEN** the same landing is followed by `git worktree remove` of the change's worktree
- **THEN** status still prints the leftover line and still leaves the folder out of `Active specs:`

#### Scenario: Edited copy is not a leftover
- **WHEN** the checkout's copy was edited after approval and the change landed
- **THEN** status prints no `Leftover drafts:` section

#### Scenario: Not landed yet
- **WHEN** the change has archived on its branch and the default branch does not hold its archive
- **THEN** status prints no `Leftover drafts:` section

#### Scenario: Removing it clears the flag
- **WHEN** the printed `rm -r` command has run
- **THEN** status prints no `Leftover drafts:` section
