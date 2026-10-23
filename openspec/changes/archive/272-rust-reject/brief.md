---
queue_item: rust-reject
queue_hash: sha256:4ef846b5b683703a91d6dca2ebebd9639abb8c4f05127b40130f835373c113fc
planner: null
date: 2026-10-21
---

### Goal

A human rejects a plan or a failed change with a reason. Rust's approve feature approves but cannot reject.

### Context

As of 2026-10-22:

- TypeScript rejects in `rejectSpec` in `src/core/lifecycle/reject.ts`, called from `src/cli/reject.ts`. An unapproved active change is eligible. An approved one is eligible only with an active failure and no running task. Every refusal happens before the first write.
- `crates/features/approve` holds the approve command (250); reject is the same capability in TypeScript (`spec-lint-and-approve`).

### Requirements

- `osq reject <id> "<reason>"` in Rust moves the folder and writes the rejection files TypeScript writes, and refuses each case TypeScript refuses, with its text.
- Tests run it on fixture changes for each eligible and refused case, with vcs off.

### Non-goals

- Rejections with vcs on, and steering a rejected plan.
