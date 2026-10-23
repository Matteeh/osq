---
queue_item: plan-queue-slug
queue_hash: sha256:c86d345ec30232cde43e30c46e70fcd9abcf47174b23ab6c5f75627a434a47d7
planner: null
date: 2026-10-23
---

### Goal

`osq plan --next` always takes the first eligible queue item, so planning a later item means planning every eligible item before it. `osq plan <slug> -p` for a queue slug ignores the queue brief and makes an empty scaffold. Planning 303 forced planning 300 to 302 first.

### Context

As of 2026-10-23:

- `planCommand` in `src/cli/plan.ts` takes `--next`, handled by `prepareQueueSelection` and `createQueueChange` in `src/cli/plan-queue.ts`. Without `--next` it steers an existing change or creates an empty one.
- The queue parser sits in `src/core/status/queue-parser.ts`, and `osq queue` prints which items are eligible and which have unmet dependencies.

### Requirements

- `osq plan --next <slug>` plans that queue item as `--next` plans the first one: same brief, same queue hash and same handoff.
- It refuses, with a line naming the reason, an unknown slug, an item that already has a change, and an item whose `Depends on` is unmet.
- `osq plan --next` with no slug behaves as today.

### Non-goals

- The Rust plan feature; a later item ports it.
- Reordering `queue.md`.
