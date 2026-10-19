# Tasks

## 1. Rust core event

- [x] 1. When osq-core reads an exit_continued event line, it yields the ExitContinued variant and writes the same JSON value back

## 2. Watcher

- [x] 2. When an agent exits non-zero after writing its result file in that attempt, the watcher records exit_continued and judges the task by its own checks
