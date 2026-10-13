---
queue_item: auto-steer-blocked
queue_hash: sha256:e40086ceecaea237c5a6672c4bbc0215c9a4e5dc212300b898a936b0d2c13c88
planner: null
date: 2026-10-13
---

### Goal

When a task dies `blocked`, or another trigger asks for steering, osq starts the planner on the steering prompt by itself. The planner revises and lints the plan in the worktree, and the human only reads the revised plan and taps approve, from the CLI, the dashboard or the phone. No shell step between a plan miss and the approve tap.

### Context

As of 2026-10-12:

- A steering trigger today waits for a human to run `osq plan <id>` in a terminal. `src/cli/plan.ts` starts the planner through the harness's `spawnInteractive`; `src/cli/plan-steer.ts` builds the steering section.
- Headless roles already exist: the executor and the validator run without a terminal, each with its own role environment (ADR 007).
- `osq mcp` (163) gives a planner tools that only write the change folder.
- Notion "Making osq bulletproof" candidate 6; the headless-server direction is that humans only decide.

### Requirements

- A config switch turns automatic steering on; the default is off.
- When on, the watcher starts one headless planner per steering trigger, in the change's worktree, with the same prompt `osq plan <id>` builds and the planner role's environment. It writes only the change folder and runs `osq lint`.
- The revised plan appears in the inbox as an approval to tap, with what changed since the last approval. The planner never approves.
- A planner run that fails, times out, or leaves lint red leaves the trigger as today, and the inbox says what happened.
- At most one automatic planner run per trigger; a second needs a human.

### Non-goals

- Planning new changes from the queue automatically.
- Steering triggers that need the default branch.

### Notes for planning

- This adds a role the watcher spawns; check whether ADR 006 and ADR 007 cover it or an ADR is needed first, and if so make it the first task.
- `change-verify-names-plan-conflict` makes more plan misses end as `blocked`, which makes this item more useful.
