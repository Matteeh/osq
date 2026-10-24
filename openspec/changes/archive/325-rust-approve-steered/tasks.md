# Tasks

## 1. Core

- [x] 1. When an event line has the type approved, core reads it into Event::Approved with its hash and targets and writes it back unchanged

## 2. Approve

- [x] 2. When a human approves the revised plan of a steered change, the Rust approve feature seals it, appends an approved event and commits it in the worktree, or refuses as TypeScript does

## 3. Retry and the CLI

- [x] 3. When approve's approved event is delivered, the Rust retry feature clears each steering trigger once, and osq approve through the CLI leaves the change as TypeScript does
