---
queue_item: rust-scheduling-adr
queue_hash: sha256:9a4e78062d931fbea2e9e7430b79339e4f1f26aadc64e3115c8e195e7aaa41a1
planner: null
date: 2026-10-20
---

### Goal

The loop crate and its scheduler are built against an accepted decision, as the Rust roadmap requires: the scheduling ADR is written right before the crate.

### Context

As of 2026-10-19:

- The design lives in Notion, OSQ > Rust Rebuild > "Parallel work and scheduling" (in progress, not accepted). The flow is backlog, queue, approved planned changes, then run and land. The scheduler looks only at approved changes.
- Its leaning decisions (Mathias, 2026-10-18): the scheduler is a pure rule in core that gives each change one state with a reason (Ready, Waiting on <id>, Blocked by <id> naming the shared files or crate, Needs approval). Overlap is decided from approved task scopes, not whole capabilities; a change that touches `crates/core` or a kernel crate locks that whole crate. Landing stays one at a time. There is no global agent limit by default, only an optional ceiling in config. Agents are scheduled and limited per role, so reviews never starve coding. Every agent run has hard caps on spend, tokens and time. A usage limit pauses only the agents on that model or harness. Overlap is checked again as a gate before a change starts and before it lands.
- Open question on that page: whether tasks inside one change may run in parallel.
- ADR 022 says the watcher becomes `loop` in the kernel, which schedules work and calls the hooks features register. `crates/kernel/loop` (`osq-kernel-loop`) is an empty skeleton on `osq-core`.
- ADR 021 (autopilot) runs one change at a time in the TypeScript version. ADRs 022 to 026 apply to `group:rust` and name their checks in `tests/rust-adrs.test.ts`. Every new Rust ADR ships with its enforcement (Rust Rebuild page).

### Requirements

- ADR 027, Scheduling, `applies_to: [group:rust]`, records the leaning decisions above as decided, with a one-sentence rule, and says which TypeScript behaviour it does not change.
- It defers parallel tasks inside one change, as a named open question with what would decide it.
- Its `checks` names a test that exists when it is accepted, such as `tests/rust-adrs.test.ts` extended for ADR 027. It names the enforcement the next two items add: the scheduler's tests in core and the loop's tests.
- The ADR's `## Enforcement` lists every rule that is not enforced yet, with the change that will enforce it.

### Non-goals

- Any Rust code; that is `rust-scheduler-core` and `rust-loop-schedule`.
- Changing ADR 021 or how TypeScript osq runs changes.
- The backlog adapter for Notion or Jira, webhooks and the board UI.
