# Tasks

## 1. The diff in verify's environment

- [x] 1. When osq runs a verify for a change with a base commit, the command gets OSQ_DIFF naming a file with the change's diff

## 2. Rust verify runs the mutants

- [x] 2. When scripts/verify-rust.sh runs with OSQ_DIFF set, it runs cargo-mutants on that diff after the tests, and AGENTS.md tells executors so
