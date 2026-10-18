# Spec Delta: web-inspection

## MODIFIED Requirements

### Requirement: System graph links
The graph SHALL hold these edges, each from its reader and no other source:

- `contains`: from a group to each capability whose living sidecar names it,
  from a capability to each requirement of its living spec, and from a
  requirement to each of its scenarios. A group node SHALL exist only for a
  group some sidecar names.
- `applies_to`: from an accepted ADR to each capability with a living spec
  that its `governs` list holds, so a `group:<name>` entry gives an edge to
  each member of the group. An ADR whose `appliesTo` is `all` SHALL have no
  `applies_to` edge; its node's `appliesTo` says `all`, and a group ADR's node
  keeps its `appliesTo` as written.
- `reads` and `writes`: from a change to a capability, exactly the `reads` and
  `writes` edges of the `WebGraph` document for the same tree. Every change
  node of that document SHALL be a node here.
- `imports`: from capability A to capability B, A and B different, when a file
  A's Code ownership covers imports a file B's covers, by the import graph
  built with the OpenSpec root skipped. A file covered by several
  capabilities counts for each. The edge SHALL carry `pairs`, every
  `{ from, to }` file pair that makes it, sorted, and `code` and `test`, the
  number of those pairs whose importing file is not, or is, a test path by
  "Test paths".

#### Scenario: Group and ADR edges
- **WHEN** `pricing`'s sidecar names the group `sales`, an accepted ADR 001 applies to `pricing`, and an accepted ADR 002 applies to `all`
- **THEN** the graph holds `contains:group:sales->capability:pricing` and `applies_to:adr:001->capability:pricing`, and `adr:002` has `appliesTo: "all"` and no `applies_to` edge

#### Scenario: Change edges
- **WHEN** a change writes a `pricing` delta and reads `billing`
- **THEN** the graph holds its change node with a `writes` edge to `capability:pricing` and a `reads` edge to `capability:billing`

#### Scenario: Import between capabilities
- **WHEN** `src/billing/invoice.ts`, owned by `billing`, imports `src/pricing/quote.ts`, owned by `pricing`, and `tests/billing-invoice.test.ts`, also owned by `billing`, imports it too
- **THEN** the graph holds one `imports` edge from `capability:billing` to `capability:pricing` with `code` 1, `test` 1, and both pairs

#### Scenario: No import, no edge
- **WHEN** no file `pricing` owns imports a file `billing` owns
- **THEN** the graph holds no `imports` edge from `capability:pricing` to `capability:billing`

#### Scenario: Group ADR edges
- **WHEN** living `pricing` and `invoices` have sidecar group `sales` and an accepted ADR 005 applies to `[group:sales]`
- **THEN** the graph holds `applies_to:adr:005->capability:invoices` and `applies_to:adr:005->capability:pricing`, and `adr:005` has `appliesTo: ["group:sales"]`
