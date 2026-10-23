# Tasks

## 1. Config

- [x] 1. When osq.toml holds a gates table, the config kernel reads commitRetries with TypeScript's default

## 2. Run

- [x] 2. When a worktree is off its branch or dirty, or a task commit fails, the Rust run feature halts the change
- [x] 3. When a change is halted as commit_failed, the Rust run feature makes the missing commits within gates.commitRetries and clears the halt
