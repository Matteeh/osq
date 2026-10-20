---
queue_item: gates-see-the-change
queue_hash: sha256:3fef7bd974412b0e40e095c47ce936f5127facdfc3c7caedad20e3262cde4dd6
planner: null
date: 2026-10-20
---

### Goal

A change can't fail a repository gate over something its own delta fixes, so `owned-once` joins the blocking corpus gate and no gate needs a "wait until archive" follow-up again.

### Context

As of 2026-10-20:

- 232 added `change_link_gates`, which counts the requirements and scenarios a change's deltas add, modify or rename to as live, and `link_gates_corpus.rs` passes the folder in `OSQ_CHANGE` (set for every verify, archive included).
- Ownership still comes only from the living specs, so a capability a change creates owns nothing until archive. That is why `link_gates_corpus.rs` does not fail on `owned-once` (232's planned follow-up `rust-link-gates-ownership`, which this item replaces).
- ADR 024's Enforcement says link gates run "with the change, the base commit and the graph as explicit inputs".

### Requirements

- With a change, the link gates also take the `Code ownership` globs that change's deltas add or modify, so a new capability's files are owned during its own run.
- `link_gates_corpus.rs` fails on every finding, `owned-once` included, and rust-linter "Live link gates" says so.
- rust-linter's spec states the rule for later gates: a repository gate takes the change in flight as an input.

### Non-goals

- The per-change rules of ADR 024 (governing ADRs named, coverage, departures).
- Gates over the TypeScript code.
