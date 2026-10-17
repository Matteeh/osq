# Tasks

## 1. Rust facts in the languages slice

- [x] 1. When a language map reads a Cargo workspace, it lists each crate's test folders, and the Rust adapter finds each test module's lines

## 2. Runner gate for Rust

- [x] 2. When an executor edits a preexisting Rust test in a crate's tests folder or inside a test module without tests.modify, the runner kills the task

## 3. Lint for crate tests

- [x] 3. When a task's scope holds an existing crate test without tests.modify, lint rejects the task

## 4. Coverage list

- [x] 4. When osq reports the gates a Rust project lacks, the test-modification gate is no longer one
