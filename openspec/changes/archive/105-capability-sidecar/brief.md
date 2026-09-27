---
queue_item: capability-sidecar
queue_hash: sha256:ddf267411105e0fa93001d997e30bdef8ecfbe67cc81f96e6d370a9c0c2ba8a7
planner: null
date: 2026-09-27
---

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
