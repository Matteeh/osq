# Tasks

## 1. Guard

- [x] 1. When an agent in an osq worktree runs git or edits outside its scope, the task dies, and a new test file is never a violation

## 2. Run

- [x] 2. When a change runs in its worktree, each verified task and the archive are commits, a dead task leaves a clean branch and a patch, and dirt or a failed commit halts it

## 3. Recreation

- [x] 3. When osq watch starts and an approved change's worktree is missing, it recreates the worktree on the change's branch

## 4. Lifecycle and status

- [x] 4. When a human runs reject, retry, or done on a change in a worktree, osq writes there and never in the checkout, and status warns while a task runs there
