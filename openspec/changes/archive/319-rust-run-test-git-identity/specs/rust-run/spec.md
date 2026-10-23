## MODIFIED Requirements

### Requirement: Worktree run
After it loads the config, `run` SHALL find the change as "Run refusals"
says when git is off, and with git on SHALL instead match the id, as
rust-approve "Approve lookup" matches it, against the active changes of
rust-storage `list_tree_changes` of rust-storage `change_trees` of the
root, with one candidate per entry of rust-vcs `worktree_list` of a
`GitVcs` at the root with the config's `timeouts`, and no stacked folders,
in that order. A git error fails with its display. Git is on when
`vcs.enabled` is true and rust-vcs `GitVcs::root`, run in the root, gives
a folder that is the root itself once both are canonicalized. The change
sits in the tree whose root its path starts with, and that tree's root is
the root every other run requirement names: the git check, the executor's
folder, the prompt, the scope audit's status, the verify runs and the
paths they write use it. With git off, and for a change in the root, `run`
behaves as the other run requirements say and makes no commit.

The scratch repository the run tests build for a worktree run SHALL carry
its own git identity in its local config, so `run`'s commits get a
committer on a machine with no global or system git config.

#### Scenario: Worktree run finds its tree
- **WHEN** a test builds a scratch git repository from the run fixture whose `osq.toml` turns git on with the author `Osq Bot <bot@example.com>`, adds the worktree `<scratch>/trees/001-a` on a new branch `osq/001-a` holding the change, approved there with its seal and committed, removes the change from the checkout, runs the fake pi in the `done` mode, and runs `run` with `1` and `1`
- **THEN** it gives the output `Task 1 of 001-a done\n`, the worktree holds `src/a.txt` and `openspec/changes/001-a/.run/done/1`, and the checkout holds neither

#### Scenario: Worktree test repository identity
- **WHEN** a test builds the scratch repository "Worktree run finds its tree" builds
- **THEN** `git config --local` run in the checkout and in the worktree gives `Osq Test` for `user.name` and `osq@example.com` for `user.email`
