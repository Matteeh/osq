---
queue_item: rust-mutants-verify
queue_hash: sha256:56c8a93df0e0440882fa8b71c0db3574af5f7c644f13a1f82d831c528bdd6126
planner: null
date: 2026-10-18
---

### Goal

An executor that adds or changes Rust code without a test that catches its mutants fails verify inside its own task and fixes it there, instead of the miss turning up in CI after land.

### Context

As of 2026-10-18:

- After `rust-mutants-core`, `scripts/mutants-rust.sh` runs cargo-mutants on a diff and Rust CI blocks on a missed mutant. osq lands on main locally and pushes afterwards, so CI only reports a miss after the change has landed.
- Rust changes use `sh scripts/verify-rust.sh` as the proposal verify, which the watcher runs after every task and at archive.
- A full rust-core run takes 16 minutes, too slow for every task. Mutating only the lines the change touched keeps it to the new code.
- The watcher passes `OSQ_CHANGE`, the change folder, to every verify command, and `.run/base` in that folder holds the commit the change started from.
- ADR 003: agents never run git, and osq alone writes to git. A verify command is run by osq, not by an agent, but whether it may read git, for example with `git diff`, is not written down.
- osq's existing mutation check (`traceability.mutation`, `src/watcher/mutation-check.ts`) observes TypeScript only and never fails a task.

### Requirements

- A Rust change's verify runs cargo-mutants on the Rust lines the change has touched since its base, and fails on a missed mutant or timeout. Outside an osq run, such as in CI or by hand, the same script runs on the diff it is given.
- The diff comes from something osq already gives verify or from a read-only git command. The planner checks this against ADR 003 and ADR 007, and if neither fits, osq writes the diff itself.
- A change with no Rust line touched runs no mutants and passes this step.
- AGENTS.md's Rust crates section tells executors that verify fails on a missed mutant and how to run the check by hand.

### Non-goals

- Making osq's TypeScript mutation check cover Rust.
- A new dead reason; a missed mutant fails verify like any other failing check.
