# Tasks

## 1. Patch and discard in the vcs kernel

- [x] 1. When osq saves or drops an agent's work in an osq worktree, the vcs kernel gives TypeScript's patch and discard

## 2. Run in the worktree

- [x] 2. When git is on and a human runs a task of a change in its osq worktree, the Rust run feature finds the change there and runs the task in that tree

## 3. Verified task commit

- [x] 3. When a task in an osq worktree passes its verdict, the Rust run feature commits it on the change's branch with TypeScript's paths and message

## 4. Dead and paused tasks in the worktree

- [x] 4. When a task in an osq worktree dies or pauses on a usage limit, the Rust run feature saves its patch, discards the agent's outside files and commits the dead records as TypeScript does
