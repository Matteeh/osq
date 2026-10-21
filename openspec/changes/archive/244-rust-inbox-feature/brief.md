---
queue_item: rust-inbox-feature
queue_hash: sha256:718d364656b78ee111a87ddfedf8650dce444ffb14fd82f6d4a3760da6fd2c4d
planner: null
date: 2026-10-21
---

### Goal

The inbox is the human's view: which changes wait for an approve, a retry, a plan or a land. Its rules are a pure projection over change states, so it can be built from the read model and core's fold alone, in parallel with the report feature.

### Context

As of 2026-10-21:

- `crates/features/inbox` is a placeholder. TypeScript: `src/core/status/inbox-projection.ts` (`ReadInboxOptions`, the projection), `inbox-text.ts` (the text), `inbox-paused.ts`; `src/cli/inbox.ts` is the command.
- Core's fold gives a change's state from its events (`apply_change`, `ChangeStatus`); the storage kernel reads change folders (`list_changes`, `read_change`).
- Architecture example: run records `TaskDead`, storage updates the `changes` view, inbox asks for the changes needing you; inbox and run never touch each other.

### Requirements

- `osq-feature-inbox` implements core's `Feature` with an `inbox` command that projects the active and archived-but-unlanded changes into inbox items with the same kinds, order and next-step text as `inbox-projection.ts` and `inbox-text.ts`.
- The projection is a pure function over change states and is tested on hand-built states, one case per item kind.
- A golden test on a fixture repository compares the printed inbox with the text TypeScript printed once and committed.

### Non-goals

- `--follow`, sounds, the dispatcher, the usage-limit pause line, and CLI wiring.
- Reading another project or `~/.osq`.
