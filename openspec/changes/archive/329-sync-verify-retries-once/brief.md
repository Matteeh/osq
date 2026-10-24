---
queue_item: sync-verify-retries-once
queue_hash: sha256:eef4a9a5b090fa4ba1b9b97f9ac84cb2d26cf531e45c3ad56a9a0c1bbcb3981f
planner: null
date: 2026-10-23
---

### Goal

When land or sync merges main into a change and the verify fails, osq stops the change as a regression that needs steering, so a human must edit the plan and approve again. A test that fails only sometimes, or a fix main already has, costs a manual approve though the plan is fine. On 2026-10-24, 319 stopped on the WSL missing-program flake that 320 had fixed, and re-approving it needed a made-up plan edit because approve commits `osq: <id> replanned` and git refused with `nothing to commit`.

### Context

As of 2026-10-24:

- TypeScript: `src/core/vcs/sync-verify.ts` gives `sync_verify_red`; `src/core/vcs/land-stop.ts` records it on the change's branch; `isDefaultBranchTrigger` in `src/core/status/steering.ts` makes it a default-branch trigger, recovered only through `osq approve` (`src/core/spec/approve-default-branch.ts`).
- Rust land sync (294) runs the same verify.

### Requirements

- When the sync verify fails, osq runs it once more on the same merged tree before stopping. Only a second failure stops the change as `sync_verify_red`, with the second run's output.
- Both runs are in the change's events, so a flaky test stays visible in report.
- TypeScript and Rust land sync behave the same.

### Non-goals

- More than one extra run, or a configurable count.
- Re-approving a default-branch stop with no plan edit; `rust-approve-default-branch-steering` covers that for Rust.
