# Tasks

## 1. Recovery without hand git

- [x] 1. When osq fails to commit a task's record, the watcher commits it on a later cycle and clears the commit_failed halt by itself
- [x] 2. When a sync merges the default branch into an active change and a done task's verify passes, the sync recertifies the files only the merge changed
- [x] 3. When osq approve runs inside an osq worktree, it approves from the checkout and says so
- [x] 4. When an approval flags a shared file, it says the watcher re-runs the owner's verify, and the README describes the commit catch-up and the sync's recertification
