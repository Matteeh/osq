# Tasks

## 1. Cargo manifest reader

- [x] 1. When the Rust adapter reads a Cargo.toml, it returns the crates every dependency table declares, or the line where it could not read

## 2. Gate for Cargo manifests

- [x] 2. When a task adds a crate to a scoped Cargo.toml, the watcher records it and kills the task when an accepted ADR denies it or the manifest cannot be read

## 3. Coverage list

- [x] 3. When osq reports the gates a Rust project lacks, the denied-dependency gate is no longer one
