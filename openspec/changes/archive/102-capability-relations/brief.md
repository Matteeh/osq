---
queue_item: capability-relations
queue_hash: sha256:c9195aed40200da362da9e31260d12497d4b9c232ca28e254fd774854aeefb72
planner: null
date: 2026-09-27
---

### Goal

Every change relates to at least one capability, creating a capability is an explicit declaration, every capability name osq reads names a real capability, and every caller reads code ownership through one function.

### Context

- Lint derives a change's writes from its delta folders at `openspec/changes/<id>/specs/<capability>/`. An ADDED-only delta for a capability that doesn't exist creates a new capability at archive, so a misspelled folder silently creates one.
- The proposal's reads are parsed as `features.reads` in `src/core/spec/parser.ts` and never checked against the living specs.
- `parseCodeOwnership` in `src/core/spec/parser.ts` extracts the globs of a living spec's `### Requirement: Code ownership` block, and `readCapabilityOwnership` in `src/core/spec/capability-impact.ts` reads every capability's globs. As of 2026-09-27 they are called from `impact-lint.ts`, `traceability-lint.ts`, and `src/core/report/report-traceability.ts`. Recheck for other readers.
- `traceability.capabilities` in `osq.config.ts` names capabilities. `validateTraceabilityConfig` in `src/core/foundation/config-traceability.ts` checks only that it is `'all'` or a list of strings, so a misspelled name opts nothing in and nothing reports it.
- There are eight capabilities: cli-foundation, metrics-and-reporting, spec-lint-and-approve, status-inspection, traceability, version-control, watcher-and-harness, and web-inspection. Recount before stating numbers.
- In git stage 0, a test that pinned osq's ADR list by number broke as soon as an ADR was added.

### Requirements

- Lint rejects an active change that writes no delta and declares no read, naming both ways to fix it.
- Every entry in the proposal's reads names an existing capability or one the same change creates. Otherwise lint rejects it and suggests the nearest existing name.
- Proposal frontmatter accepts `creates: [<capability>]`.
  - An ADDED-only delta for a missing capability that isn't listed in `creates` is rejected, with the nearest existing name.
  - A `creates` entry that already exists is rejected.
  - A `creates` entry with no delta that adds it is rejected.
- Every name in `traceability.capabilities`, unless it is `'all'`, names an existing capability or one an active change creates. Otherwise osq reports a config error with the nearest existing name.
- `osq approve` prints one line per capability the change creates.
- One function answers code ownership, exposed as `getCapabilityOwnership()` or by keeping `readCapabilityOwnership` as that function. Every reader uses it instead of calling `parseCodeOwnership` itself.
- README and the managed `PLANNER.md` block state the relation rule, that creation is declared in `creates`, and that a planner never invents a capability to avoid touching an existing one.
- A lint test runs the pinned OpenSpec validator over a fixture change carrying `creates:`, so compatibility stays checked across upgrades.

### Surface

- Frontmatter: `creates`.
- Lint errors: missing relation, unknown read, undeclared creation, duplicate creation, creation without a delta.
- Config error: unknown capability in `traceability.capabilities`.

### Non-goals

- Groups and other capability metadata. That's `capability-sidecar`.
- Statuses, overrides or project rule settings.
- Changing the spec or delta format, or how deltas merge.
- Adding relations to archived changes.

### Notes for planning

- Recount the capabilities and the archive through the latest change before stating numbers in the proposal.
- Tests check behaviour on fixtures. None of them pins this repository's list of capabilities, so adding a capability can't break a test.
- The README and `PLANNER.md` edits are tasks in the change, gated by verify, not human steps.
