---
queue_item: rust-specs-merge
queue_hash: sha256:f0a84f456c203dbeea747ee3ba3ec16e0af5d47283c0b425ddd0e04991dcb5e8
planner: null
date: 2026-10-18
---

### Goal

Rust osq can archive a change's deltas into the living specs without the Node CLI, with the same result TypeScript gets.

### Context

As of 2026-10-18:

- TypeScript merges in `src/core/spec/delta.ts` (`mergeDelta`, `serializeCapabilitySpec`, `DeltaMergeError`) and `src/core/spec/apply-deltas.ts` (`mergeLivingSpec`, `applyOpenSpecDeltas`), and checks the merged result in `src/core/spec/merged-spec-check.ts`.
- ADR 026 section 3 keeps today's semantics, including that living specs are re-derived at sync rather than merged by git, and osq's `<id>-<slug>` archive folders.
- `osq land` rebuilds the living specs from the archive, so applying every archived change's deltas in order should give `openspec/specs/` as it stands.
- `tests/openspec-differential.test.ts` compares osq's merge with `openspec archive` over the cases in `tests/fixtures/openspec-diff/`.

### Requirements

- The kernel merges a change's delta specs into the living specs and serializes them byte for byte as `serializeCapabilitySpec` does. A delta it cannot apply is an error naming the capability and requirement, as `DeltaMergeError` does.
- The merged result is validated with `rust-specs-validate`'s rules, replacing `merged-spec-check.ts`.
- A corpus test replays the archive's deltas in order and gets the living specs byte for byte, or names the changes it cannot replay as a fixed list, as the storage replay test does.
- A test runs the cases in `tests/fixtures/openspec-diff/` and gets the result each case expects for osq.

### Non-goals

- Writing specs to disk, archiving folders or touching git; the archive feature does that later.
- Changing the TypeScript merge.
