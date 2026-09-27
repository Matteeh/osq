---
queue_item: capability-graph
queue_hash: sha256:0aed56ec29eef70617d8cd79907441732cf00b3cc0d573a612fb871c21634080
planner: null
date: 2026-09-27
---

### Goal

The graph view in `packages/ui` shows the whole system as one map you zoom into, and each level shows a different kind of detail: groups and capabilities, then requirements and scenarios, then tests and functions. Every node and edge comes from a link osq already checks, so the map is true. It answers the questions an architect or a new developer asks, such as what an ADR governs or what changing a scenario touches.

### Context

- `packages/ui` has a graph view with capability lanes, grouped by `group` after `capability-sidecar`. `osq serve` serves it. Recheck how the UI receives its data.
- `capability-relations` relates every change to a capability through its deltas and reads, makes creation explicit, and gives one ownership reader.
- `capability-sidecar` gives every capability a `group`.
- `traceability-scenarios` (change 081) gives the scenario index, `buildScenarioIndex` in `src/core/trace/scenario-index.ts`, which maps each scenario to the tests that name it and the functions they cover, and the `@scenario` and `@adr` tags on functions.
- `traceability-mutation` (change 083) records surviving mutants per function when it's turned on.
- The ADR reader gives each ADR's status and scope.
- `buildImportGraph` in `src/core/spec/import-graph.ts` knows which files import which.
- `docs-digest` has not landed as of 2026-09-27. If it has by planning time, its archive reader lists the changes that touched each capability.

### Requirements

#### Graph data

- `osq graph --json` prints the graph as nodes and edges with kinds and stable ids. The UI gets the same data from `osq serve`. The format carries a version.
- Node kinds: group, capability, requirement, scenario, test file, function, ADR and change.
- Edges and where they come from:
  - a group contains a capability, from the sidecar
  - a capability contains a requirement, and a requirement contains a scenario, from the living spec
  - an ADR applies to a capability, from the ADR's scope
  - a test proves a scenario and covers a function, from the scenario index
  - a function follows an ADR, from its `@adr` tag
  - a change writes or reads a capability, from its deltas and reads
  - a capability depends on another when a file one owns imports a file the other owns, from the import graph and Code ownership
- Each node carries what its detail panel needs: a capability its Purpose and gap counts, a scenario its THEN lines and tables, a function its file, tags and surviving mutants.
- Gaps are marked: scenarios no test proves, exported functions in a capability's ownership that no scenario claims, and files no capability owns.
- The graph data is built from the existing readers and indexes, and cached by file hash like the scenario index. The same inputs give identical data.

#### Semantic zoom

- **Level 1, the system.** Groups and their capabilities, the dependency edges between capabilities, the ADRs that apply to `all` around them, and gap counts per capability.
- **Level 2, a capability.** Its requirements and scenarios, the ADRs that apply to it, and its gaps in red.
- **Level 3, a scenario.** Its THEN lines and tables, the tests that prove it, and the functions they cover.
- **Level 4, the code.** A function with its tags, its file, its surviving mutants and the last change that touched it.
- Zooming into a node opens its next level, and zooming out returns. The view draws only the current level and its neighbours, so a project with thousands of scenarios stays fast.
- Every node opens a detail panel. From level 4, the panel links to the file.
- For a capability not opted into traceability, levels 3 and 4 aren't available, and the view says traceability isn't on for it.

#### Views that answer questions

- From an ADR: what it governs, meaning the capabilities it applies to and the functions that follow it.
- From a scenario: its blast radius, meaning the tests that name it and the functions they cover.
- A gaps view: every gap across the system.
- From a capability: the changes that touched it, newest first.
- The URL names the current node and level, so any view can be shared.

### Surface

- CLI: `osq graph --json`.
- The versioned graph data format.
- The graph view's levels, question views and URLs.

### Non-goals

- A time slider that replays the graph through the archives. A later change can add it on `docs-digest`'s reader.
- Editing anything from the graph. It only reads.
- Modules' published and consumed events from the ERP. That comes once modules declare contracts.

### Verify

`pnpm verify`, plus tests:

- `osq graph --json` on a fixture has every node and edge kind, each from the right source, with ids stable across runs
- a function carries its tags and surviving mutants, and a scenario carries its THEN lines and table
- an untested scenario, an unclaimed function and an unowned file are each marked as gaps
- a dependency edge appears when a file owned by one capability imports a file owned by another, and not otherwise
- each level shows only its own node kinds and their neighbours, and zooming in and out moves between them
- the ADR, blast radius, gaps and history views return the right nodes on the fixture
- a URL with a node and a level reopens that view
- a capability not opted into traceability shows levels 1 and 2 only, with the message
- on a synthetic project with 2,000 scenarios, each level opens without drawing nodes outside it
- building the graph data twice gives identical output

### Notes for planning

- Build the graph data in core, in its own module fed by the existing readers. The UI only draws.
- The pricing sample from the traceability vision is a fixture for levels 3 and 4. `osq-traceability-vision.md` is not in this repository; ask the human for it or write an equivalent fixture.
- Pick a graph library that handles large graphs in the browser, such as one that draws with WebGL. It belongs to `packages/ui`, not to the CLI's runtime dependencies.
- If `docs-digest` has landed, reuse its archive reader for change edges and the history view.
- This is likely too large for one change. Consider splitting graph data and `osq graph --json` from the zoomable view.
