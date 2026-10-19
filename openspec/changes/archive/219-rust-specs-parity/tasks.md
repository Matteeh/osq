# Tasks

## 1. No runtime Node

- [x] 1. When the linter kernel scans a workspace, it finds every runtime Command::new that spawns node, npx or openspec, and this repository has none

## 2. Validate parity

- [x] 2. When the validate parity test runs, the Rust validator and the OpenSpec CLI agree on every living spec, archived change and fixture except the five listed

## 3. Archive parity

- [x] 3. When the archive parity test runs, the Rust merge gives the result openspec archive gives on every differential case

## 4. CI and ADR checks

- [x] 4. When Rust CI runs, a parity job runs the parity tests against the pinned and weekly latest OpenSpec, and ADR 026's checks name the new tests
