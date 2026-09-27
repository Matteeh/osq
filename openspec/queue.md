# osq queue

The remaining work on osq itself, as an osq brief queue.

Each item's body becomes that change's `brief.md` word for word. Drive the run with `osq plan --next`, then plan the change in a Claude Code session, review it, and `osq approve`.

Stage 1 of `decisions/003-git-strategy.md` is complete, and change 100 turned `vcs.enabled` on for this repository. From change 101, osq's changes run in worktrees, are approved on `main`, and land by hand.

The inbox dispatcher was four items. `inbox-dispatch-order`, `inbox-follow-sound`, and `inbox-cards` landed as changes 097 to 099; `inbox-wait-log` remains.

Capabilities are three items, in order: `capability-relations`, `capability-sidecar`, and `capability-graph`, queued on 2026-09-27.

osq reads only the `## [slug]` items below. Everything above the first item is for people.

## [inbox-wait-log] osq inbox records how long items waited and osq report shows it

Depends on: nothing

### Goal

osq records how long each item waited for a human, so it shows whether reviews happen sooner without getting worse.

### Context

- `inbox-cards` opens cards. `osq inbox` runs on the reviewer's machine, and `~/.osq/` already holds derived per-user data such as `~/.osq/last-look/`.
- `src/core/report/report.ts` is allow-listed in the line budget, so new report sections go in their own module.

### Requirements

- While it runs, `osq inbox` appends to a log under `~/.osq/inbox/`, per project. For each item it records when the item appeared, when its card opened, and when it disappeared, and whether the watcher had anything runnable at each of those moments.
- An item that appeared while no inbox was running starts its waiting time when the inbox first sees it, and the log marks it that way.
- The order's age tiebreak uses the log's first-seen time when there is one.
- `osq report` shows, per kind and for a chosen period, the median and longest waiting time from appearing to disappearing, how long the watcher sat idle while the top item was a human's, and how many items were handled back to back in one session. For a period with no log, those numbers say not measured.

### Non-goals

- Streaks, and routing items to one reviewer in a team.

### Notes for planning

- Test the report from a fixture log.

## [capability-relations] Every change relates to a capability, and creating one is declared

Depends on: nothing

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

## [capability-sidecar] Each capability carries a small osq.yml with its group

Depends on: capability-relations

### Goal

Each capability can carry a small osq-owned sidecar with metadata the OpenSpec spec format has no place for, starting with `group`. Groups are the outermost level of the graph view, and they group capabilities in `osq report`.

### Context

- Capabilities are folders under `openspec/specs/` with no metadata, and the graph view in `packages/ui` has no grouping.
- At change 049, OpenSpec 1.13.1 validated specs cleanly with an extra YAML file beside `spec.md`, and `openspec list --specs` was unaffected. osq still pins 1.13.1 as of 2026-09-27; recheck.
- `AGENTS.md` states that living capability specs change only when the watcher applies an approved delta.
- `capability-relations` adds `creates` to proposal frontmatter.
- In the inventory ERP, a group maps onto a module, such as an inventory group holding costing, reservations and stock movements.

### Requirements

- `openspec/specs/<capability>/osq.yml` holds `group`, a required string, and `tags`, an optional list. Unknown keys fail lint. A missing sidecar is a lint warning, and so is `group: ungrouped`.
- A capability's description is read from its spec's `## Purpose` and never stored in the sidecar.
- `creates` from `capability-relations` takes a group for each new capability, as `creates: [{ name: <capability>, group: <group> }]`. A bare name is rejected with a message showing the new form. At archive, the archiver writes the new capability's sidecar from that entry, so the sidecar is part of the approved change.
- A change may carry a replacement sidecar at `openspec/changes/<id>/specs/<capability>/osq.yml`, validated at lint and applied at archive.
- `osq migrate` scaffolds a sidecar with `group: ungrouped` for any capability without one, for projects adopting sidecars.
- Only those three paths write sidecars: the archiver for `creates`, the archiver for a replacement in a change, and `osq migrate`.
- The approval manifest records sidecar hashes for touched capabilities.
- `getMetricsReport` reports, under `coverage`, capabilities with and without a sidecar.
- The graph view groups capability lanes by `group`.
- A task in the change writes this repository's sidecars, with the groups below.

### Groups for this repository

| Capability | Group |
|---|---|
| cli-foundation | platform |
| spec-lint-and-approve | planning |
| traceability | planning |
| watcher-and-harness | execution |
| version-control | execution |
| status-inspection | inspection |
| web-inspection | inspection |
| metrics-and-reporting | inspection |

### Surface

- File: `openspec/specs/<capability>/osq.yml`, keys `group` and `tags`.
- Frontmatter: `creates` entries with a group.

### Non-goals

- Statuses, overrides, ownership in the sidecar, or project rule settings.
- Changing the spec or delta format.
- Zoom levels and other graph views. That's `capability-graph`.

### Notes for planning

- Add a test that runs the pinned validator over a fixture with sidecars, so compatibility stays checked across upgrades.
- Tests check behaviour on fixtures and never pin this repository's list of capabilities or groups.

## [capability-graph] The graph view zooms from groups down to functions

Depends on: capability-sidecar

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
