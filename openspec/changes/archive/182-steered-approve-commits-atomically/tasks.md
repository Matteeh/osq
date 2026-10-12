# Tasks

## 1. Git reads take no index lock

- [x] 1. When osq runs git, it sets GIT_OPTIONAL_LOCKS=0, so its status reads never write the index or hold index.lock

## 2. Steered approve rolls back its seal

- [x] 2. When a steered approve's commit fails, its seal files go back to their bytes before the approve and it fails saying to run osq approve again

## 3. Retry refuses uncommitted plan edits

- [x] 3. When a change's plan files differ from its worktree's last commit, osq retry refuses and names them

## 4. Recovery from a failed approval commit

- [x] 4. When a steered approve's commit fails on a held index lock, the human approves again once the lock is gone and the change lands
