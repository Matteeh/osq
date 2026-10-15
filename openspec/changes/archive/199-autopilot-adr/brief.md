---
queue_item: autopilot-adr
queue_hash: sha256:84f60686ca846aca9fd8c8405684477d5062d40be133239cbf04eba59fbe5b4e
planner: null
date: 2026-10-15
---

### Goal

ADR 021 decides an opt-in autopilot. The human plans a whole queue with a planner and approves the queue once. From then on the watcher plans, approves, runs and lands each item in order, and stops only when recovery runs out. This change writes the ADR and its checks test only; the next two items build it.

### Context

As of 2026-10-15:

- ADR 006 lets a human "only steer plans or tap decisions" and rejects headless planning for new changes. ADR 018 and ADR 019 already run a headless planner, for steering and on a tap, but a human approves every plan.
- ADR 003 says osq writes the human's checkout or main only through commands the human runs. `osq land` is such a command; `vcs.afterLand` runs after it.
- `openspec/queue.md` items carry a `queue_hash` once planned (`src/core/status/queue-state.ts`); `osq queue` shows an item `changed since planned`.
- The target is a fresh repository rebuilt from an exported queue (item `rebuild-export`), which should build from first item to last with nobody watching.

### Requirements

- The ADR's rule fits one sentence, along the lines of: "With autopilot on, a human approves the queue once; osq plans, approves, runs and lands each approved item in order, and stops the queue when recovery runs out."
- It decides: the queue approval as the human gate, sealed by a hash over every item, so an item edited after approval is not run; which gates stay (lint, verify, check, the validator) and that autopilot never skips one; the recovery ladder (automatic retries, then the steering planner with its lint-green revision approved by autopilot, at most a configured number of rounds per change, then a full stop); that autopilot is off by default and per project.
- It records which earlier ADRs it amends (003, 006, 018) and how, and a checks test where the rule can be tested.

### Non-goals

- Building any of it.
- Parallel changes. Autopilot runs one change at a time.

### Notes for planning

- Read ADR 006, 018 and 019 in full; the ADR should reuse their planner and environment rules, not restate new ones.
