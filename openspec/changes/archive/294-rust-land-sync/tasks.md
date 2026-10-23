# Tasks

## 1. Sync

- [x] 1. When main moved since the change's branch was cut, Rust land merges it into the branch, rebuilds specs and Cargo.lock, and records a stop on a conflict

## 2. Sync verify

- [x] 2. When land syncs a change whose proposal has a verify or a check, Rust land runs them on the merged tree and stops recorded when one is red
