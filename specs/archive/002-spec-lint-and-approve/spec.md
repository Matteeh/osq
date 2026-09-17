---
title: Spec verification and approval gate
depends_on: [001]
features:
  reads: [cli-foundation]
  writes: [spec-lint-and-approve]
---
## Goal

Provide spec parsing, lint validation against osq.config.ts limits, deterministic change folder hashing, and the osq approve command so specs are validated and sealed before execution.

## Contract

| Command | Expected Output |
|---|---|
| osq approve <id> | Lints spec, computes folder hash, writes .run/approved, prints approval status |

## Non-goals

- Watcher task execution and agent spawning.
- Worktree management and concurrent git merging.

## Delta

Create features/spec-lint-and-approve.md documenting spec frontmatter format, lint checks, folder hashing algorithm, and the approve command.
