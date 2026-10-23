# Tasks

## 1. Archive

- [x] 1. When a worktree archive commit fails, the Rust archive feature writes TypeScript's commit_failed record and still fails

## 2. Retry

- [x] 2. When a human retries an archived change whose archive commit failed, the Rust retry feature makes the archive commit or puts the record back

## 3. Land

- [x] 3. When a change's archive commit failed, Rust land refuses it with TypeScript's text naming the retry
