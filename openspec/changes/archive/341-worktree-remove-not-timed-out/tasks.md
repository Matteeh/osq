# Tasks

## 1. Removal bound

- [x] 1. When osq removes a worktree, git worktree remove runs under timeouts.gitWorktreeRemoveSeconds, 1800 seconds by default, not under gitSeconds

## 2. Restart stop

- [x] 2. When a restart cannot remove the worktree, approve stops with the recovery steps and leaves the markers, and a second approve finishes the restart
