---
queue_item: rust-plan-queue
queue_hash: sha256:7587330b0555fde4ef7958c5f8dc94b0429e122043aa0b45b05cda4bb667d50c
planner: null
date: 2026-10-21
---

### Goal

Planning starts from the queue. The plan feature gets the read half first: parse the queue and say, for each item, whether it is unplanned, planned, running, archived or landed, so `osq plan --next` can be built on it.

### Context

As of 2026-10-21:

- `crates/features/plan` (`osq-feature-plan`, capability `rust-plan`) is a placeholder. Core's `Feature` trait exists (ADR 028); 243 and 244 are the first features built on it.
- TypeScript: `src/core/status/queue-parser.ts` (`parseQueue`, `QueueItem`, the per-item hash of the raw text up to the next heading), `queue-state.ts` (`projectQueue`, `formatQueue`, the association of an item with its change through `brief.md`), and `src/cli/queue.ts`.
- The storage kernel reads active and archived change folders, including `brief.md`.

### Requirements

- `osq-feature-plan` implements core's `Feature` with a `queue` command that prints what `osq queue` prints for the same repository: each item's slug, title, state, change number, rejection count and the "changed since planned" flag.
- Parsing matches `parseQueue`, the item hash included, so a planned item whose text did not change is not flagged.
- A golden test on a fixture repository compares the printed queue with text TypeScript printed once and committed. A corpus test reads this repository's queue without error.

### Non-goals

- Creating change folders or starting a planner.
- `--json`, the dashboard and CLI wiring.
