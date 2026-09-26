# Tasks

## 1. Port

- [x] 1. When osq asks whether a path exists at a ref, the Vcs port answers, and a stacked approval has a fixed location

## 2. Resolver

- [x] 2. When a stacked approval exists, the change locations module lists it as its own tree

## 3. Approval

- [x] 3. When a human approves a change whose dependency is approved and has not landed, osq records a stacked approval instead of refusing

## 4. Cut

- [x] 4. When a stacked change's dependency archives or lands, the watcher cuts its branch from that commit and runs it, and halts it when the dependency changes

## 5. Reject

- [x] 5. When a human rejects a change under version control, osq commits the rejection, removes a clean worktree, keeps the branch, and withdraws a stacked approval
