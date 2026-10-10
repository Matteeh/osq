---
queue_item: capability-slices-adr
queue_hash: sha256:9cb49e4b3036d19f678e55d6e2bc50e2456ab2888590e3a7e84338d692336966
planner: null
date: 2026-10-10
---

### Goal

One rule decides how osq's code and capabilities line up: each capability is a feature, its code lives in one folder named after it, and that folder holds every layer the feature needs. The rule is accepted as an ADR, reaches AGENTS.md, and a checks test reports where the tree breaks it, so later changes can move the code one slice at a time.

### Context

As of 2026-10-10 (Notion: "Capability names follow the code", ROADMAP):

- The 8 living capabilities are horizontal layers with names that differ from their folders. cli-foundation owns `src/core/foundation/**`, all of `src/cli/**`, `templates/**` and the guidance files. watcher-and-harness owns `src/watcher`, `src/harness`, `src/core/run` and `src/core/lifecycle`. Ownership is each capability's `Code ownership` requirement and its `<!-- source: ... -->` comment, read by `src/core/spec/parser.ts`.
- 22 of the 30 changes from 136 to 165 wrote cli-foundation and 14 wrote watcher-and-harness. Only 6 wrote a single capability other than cli-foundation. A feature such as land or mcp touches `src/cli`, `src/core/<x>`, `src/core/foundation` and often `src/watcher`.
- `approve-waits-for-overlap`, later in this queue, stacks changes that write the same capability. With today's capabilities it would stack about three changes in four.
- Shared lists every feature edits: `DEFAULT_CONFIG` in `src/core/foundation/config.ts`, the command registration in `src/cli/index.ts`, the help groups, and the MCP tool list.
- The `openspec/specs/<capability>/spec.md` layout comes from OpenSpec and stays (ADR 004). Only capability names and source folders are in question.
- Living specs are rebuilt by replaying archived deltas (`osq land`, `tests/living-specs-delta-equivalence.test.ts`), so a capability cannot be renamed by moving its folder.
- 35 test files name a current capability.

### Requirements

- An ADR that applies to all states the rule in one sentence: a capability is a vertical slice of features, named after the folder `src/<capability>/` that holds its CLI command, core logic and hooks, and only a small named shared kernel sits outside every slice.
- The ADR names that kernel (candidates: config loading, `.run/` markers, the event log, harness adapters, the watcher loop) and says how a slice adds its config defaults, command, help entry and MCP tools without editing a shared list.
- The ADR says how capabilities are renamed and split: by generated changes whose deltas replay like any other, never by hand, and archived changes keep their old names.
- The ADR keeps the OpenSpec layout and file names.
- A checks test lists every source file whose owning capability's name differs from its folder, or whose owning capability spans more than one top-level source folder. It warns until the slices are moved, and the ADR says when it becomes an error.
- The ADR lists the target slices for osq's own code, as a starting map that later changes may refine.

### Non-goals

- Moving any source file or renaming any capability. Later changes do that.
- Renaming `openspec/specs/` or dropping the OpenSpec validator.

### Notes for planning

- Write the ADR first and build the checks test on it, following `architecture-adrs-first` (150).
- Size the target map from the archive: `osq query` on which changes wrote which capabilities and touched which files. Group files that change together.
- Decide what `src/core/spec` is called as a slice, so the result doesn't read `specs/spec/`.
