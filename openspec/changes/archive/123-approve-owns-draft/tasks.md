# Tasks

## 1. Changes outside the checkout

- [x] 1. When a change runs in a worktree, is stacked, or was rejected on its branch, new changes skip its number and lint still finds it
- [x] 2. When a checkout folder shares a running or landed change's name, status and land ignore it

## 2. Approval owns the draft

- [x] 3. When a change is approved with version control on, its checkout copy is removed, and a stacked change is approved and rejected from its stacked copy

## 3. osq done goes

- [x] 4. When a human wants a task done without its verify, osq has no command for it

## 4. Decision and docs

- [x] 5. When osq reads its decisions and docs, ADR 003 says approval removes the checkout's copy, and nothing mentions osq done
