## ADDED Requirements

### Requirement: Capability groups in the graph
<!-- source: src/core/web/web-data-graph.ts, src/core/web/web-data-types.ts, packages/ui/src/graph/layout.ts, packages/ui/src/graph/types.ts, packages/ui/src/graph/GraphCanvas.tsx, tests/ui-graph-groups.test.tsx -->
Each `WebCapabilityNode` SHALL carry `group`: its living sidecar's group, or
null when it has no sidecar or the sidecar has a problem. When at least one
capability has a group, the graph layout SHALL order lanes by group name,
with capabilities without a group last under `ungrouped`, keeping the
capability order within a group, and the canvas SHALL draw one group header
row above each group's lanes, labelled with the group name. When no
capability has a group, the lanes and the canvas SHALL be exactly as before.

#### Scenario: Grouped lanes
- **WHEN** the graph holds `pricing` with group `inventory`, `cli` with group `platform`, and `orders` without one
- **THEN** the lanes run `pricing`, `cli`, `orders` under the headers `inventory`, `platform`, and `ungrouped`

#### Scenario: No groups
- **WHEN** no capability has a group
- **THEN** the layout equals the layout before this change and no group header is drawn

#### Scenario: Group in the web data
- **WHEN** the web graph document is built for a project whose `pricing` sidecar says `group: inventory`
- **THEN** the `pricing` capability node has `group: "inventory"`, and a capability without a sidecar has `group: null`
