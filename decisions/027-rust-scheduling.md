---
status: accepted
applies_to: [group:rust]
rule: A pure rule in core starts each approved change whose dependencies are done and whose approved scopes overlap nothing running; changes land one at a time.
checks:
  - tests/rust-adrs.test.ts
---
# 027. Rust scheduling, approved changes in parallel without shared files

Date: 2026-10-20

## Status

Accepted by Mathias on 2026-10-20, from the design page "Parallel work and
scheduling" on the Notion Rust Rebuild page and his answers there of
2026-10-18. It is written right before the loop crate is built, as the Rust
roadmap requires.

Scope: this ADR governs every capability in group `rust`, the Rust crates, not
the TypeScript code under `src/`. TypeScript osq keeps running one change at a
time: its watcher and ADR 021's autopilot do not change.

## Context

osq means to run many agent changes side by side. ADR 022 keeps features in
their own crates so that parallel changes mostly touch different folders, and
says the watcher becomes `loop` in the kernel, which schedules work. Nothing
yet says what the loop may start.

Today the TypeScript watcher runs one change at a time and autopilot (ADR 021)
works through the queue in order. That is safe but slow: two changes that
touch different crates still wait for each other. Running them in parallel is
only safe if osq, not an agent, decides which changes may run together, and if
every change can say why it is waiting.

The flow has four steps: a backlog in the tool people plan in, a queue of
staged items, approved planned changes, then run and land. Only an approved
change has task scopes a human has seen, so the scheduler looks only at
approved changes.

## Decision

### 1. The scheduler is a pure rule in core

The scheduler is a function in `osq-core` with no IO. It takes the changes in
queue order, each with its approval, its explicit dependencies and whether each
is done, and the files of its approved task scopes, plus the changes now
running. It returns one state per change, with its reason, and the changes to
start now. The loop, the server and the UI board call the same function, so
they can't disagree.

| State | Meaning |
| --- | --- |
| Ready | Approved, every dependency done, and no overlap with anything running. |
| Waiting on `<id>` | An explicit dependency is not done yet. |
| Blocked by `<id>` | It overlaps a running change. The reason names the shared files or crate. |
| Needs approval | It is not approved yet. |

A change starts when it is Ready and overlaps no change started before it in
the same call. Ties go to queue order. The rule runs again whenever a change
starts, finishes or is approved, for as long as the queue has work.

### 2. Overlap comes from approved task scopes

- Two changes overlap when the files of their approved task scopes share a
  file. Scopes are compared, not whole capabilities, so two changes to one
  capability can run together when they touch different files.
- A change that touches two capabilities holds the files of both.
- `crates/core` and each kernel crate lock as a whole. A change whose scope
  holds any file under `crates/core/` or `crates/kernel/<name>/` holds that
  whole crate, so core and kernel changes queue behind each other while
  feature work keeps running.
- Scopes are a guarantee, not a hope. The scope check halts an executor that
  writes outside its scope, so the scheduler can rely on what was approved.
- Each running change has its own git worktree and its own event log.

### 3. Overlap is checked again before start and before land

A planner can widen a scope after a change is queued. Overlap is therefore a
gate twice: before a change starts, against what is running, and before it
lands, against what landed since it started. A change that fails the gate
waits; it never merges over another change's files.

### 4. Landing stays one at a time

Changes run in parallel but land one at a time, like a merge queue, so the
default branch is always the result of one verified change after another.

### 5. Agents are limited per role, not globally

- There is no global agent limit by default. Agents run while the queue has
  work. An optional ceiling in config protects the machine.
- Agents are scheduled and limited per role, such as coding and review, so a
  burst of one role never starves another.
- Every agent run has hard caps on spend, tokens and time, from config.
- A usage limit pauses only the agents on that model or harness, as it does
  today. Everything else keeps running.

## Open question: parallel tasks inside one change

This ADR schedules whole changes. The tasks of one change still run one at a
time, in order. Running a change's independent tasks in parallel is deferred.
What would decide it: whether tasks with no `depends_on` path between them
and disjoint scopes finish faster without more dead attempts, measured on
osq's own task history, and whether the scope audit and recertification of
done tasks stay correct when two tasks of one change finish in either order.

## Enforcement

- `tests/rust-adrs.test.ts` checks that this ADR is accepted, applies to group
  `rust`, names its checks and is linked from the index.
- `rust-scheduler-core` adds the scheduler to core with a table-driven test of
  every state and overlap rule and property tests that the rule is
  deterministic, that no two started or running changes overlap, and that a
  change with an unmet dependency never starts. It adds those tests to this
  ADR's `checks`.
- `rust-loop-schedule` builds the scheduler's input from change folders in the
  loop kernel, with fixture tests and a corpus test over this repository, and
  adds them to this ADR's `checks`.

Not enforced yet, each with the work that will enforce it:

| Rule | Enforced by |
| --- | --- |
| Starting changes, each in its own worktree, while the queue has work | the run feature, in the Rust roadmap's Feature crates milestone |
| The overlap gate before start | the run feature |
| The overlap gate before land, and landing one at a time | the land feature, in the Feature crates milestone |
| The scope check that halts an executor writing outside its scope | the run feature |
| Per-role limits, the optional global ceiling and hard caps per run | the Runners and harnesses milestone of the Rust roadmap |
| A usage limit pausing only that model or harness | the Runners and harnesses milestone |

Each of those changes adds its tests to this ADR's `checks`.

## Consequences

- Changes to different feature crates run side by side, so throughput grows
  with the number of independent changes, not with the speed of one.
- Core and kernel changes are serialized per crate. Work that keeps touching
  the kernel stays slow, which is a reason to keep feature logic out of it.
- Every waiting change says why, so the inbox and the board can show it
  without guessing.
- A plan with a too-wide scope costs parallelism, not correctness. Planners
  gain a reason to keep scopes tight.
- A change that only reads a file another change writes is not an overlap.
  A dependency like that must be written as an explicit `depends_on`.

## Rejected

- **Overlap by whole capability.** Simpler, but two changes to one capability
  that touch different files would wait for no reason, and cross-cutting
  capabilities would serialize most work.
- **An AI deciding what may run together.** It would be a guess, and ADR 006
  keeps deterministic steps in osq.
- **A global agent limit by default.** It caps throughput on a machine that
  could do more, and one role's burst would starve the others.
- **Landing in parallel.** The default branch would no longer be a sequence of
  verified changes, and conflicts would show up after the fact.
- **Locking feature crates as a whole.** Feature crates are where parallel
  work is meant to happen; file-level overlap is enough there.
