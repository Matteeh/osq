## ADDED Requirements

### Requirement: System graph document
<!-- source: src/core/web/system-graph*.ts, tests/web-system-graph*.test.ts -->
`getSystemGraph(projectRoot, config)` SHALL derive a `SystemGraph` document,
`{ version: 1, nodes, edges }`, from the current project tree on every call.
It SHALL persist nothing, keep nothing between calls, and carry no layout or
position. Nodes SHALL be sorted by `id`. Each edge SHALL have a `key`,
`<kind>:<from>-><to>`, SHALL appear once, and edges SHALL be sorted by `key`.
Building the document twice from the same tree SHALL give identical
`serializeWebJson` output.

Every node has `id` and `kind`. The kinds, their ids, and their other fields:

- `group`, `group:<name>`: `name`.
- `capability`, `capability:<name>`: `name`; `group`, the living sidecar's
  group or null; `purpose`, the living spec's Purpose text; `traceability`,
  whether the capability is opted in; and `gaps`.
- `requirement`, `requirement:<capability>/<name>`: `capability`, `name`, and
  `text`, the requirement's text before its first scenario, trimmed.
- `scenario`, `scenario:<capability>/<requirement>/<name>`: `capability`,
  `requirement`, `name`, `when`, the WHEN lines, `outcomes`, each THEN or AND
  text with its table rows as "Scenario outcomes" parses them, and `gap`.
- `adr`, `adr:<number>`: `number`, `title`, `status`, `appliesTo`, `rule`, and
  `path`, as `readDecisions` reads them.
- `change`, `change:<folderKey>`: `folderKey`, `number`, `title`, `state`, and
  `landed`, as the `WebGraph` change node holds them.
- `test`, `test:<file>`: `file`.
- `function`, `function:<file>#<name>`: `file`, `line`, `name`, `scenarios`,
  its `@scenario` tags written `<capability>: <name>`, `adrs`, its `@adr`
  numbers, `survivors`, and `gap`.
- `file`, `file:<path>`: `path` and `gap`.

Paths are project-relative with forward slashes. When a node would take an id
another node already has, it SHALL take the id followed by `~2`, then `~3`,
in the order its source lists them.

#### Scenario: Capability, requirement, and scenario from the living spec
- **WHEN** the graph is built for a project whose `pricing` spec has the requirement "Volume pricing" with the scenario "Volume discount tiers"
- **THEN** it holds `capability:pricing`, `requirement:pricing/Volume pricing`, and `scenario:pricing/Volume pricing/Volume discount tiers`, and the scenario's outcomes hold "the unit price follows this table" with its rows

#### Scenario: Stable output
- **WHEN** the graph is built twice from the same project
- **THEN** both serialize to the same string, and no node or edge holds a position

#### Scenario: Colliding ids
- **WHEN** one requirement holds two scenarios with the same name
- **THEN** the first takes the plain id and the second the id followed by `~2`

### Requirement: System graph links
<!-- source: src/core/web/system-graph*.ts, tests/web-system-graph.test.ts -->
The graph SHALL hold these edges, each from its reader and no other source:

- `contains`: from a group to each capability whose living sidecar names it,
  from a capability to each requirement of its living spec, and from a
  requirement to each of its scenarios. A group node SHALL exist only for a
  group some sidecar names.
- `applies_to`: from an accepted ADR to each capability with a living spec
  that its `appliesTo` list names. An ADR whose `appliesTo` is `all` SHALL
  have no `applies_to` edge; its node's `appliesTo` says `all`.
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

### Requirement: System graph traceability
<!-- source: src/core/web/system-graph*.ts, tests/web-system-graph-trace.test.ts -->
A capability SHALL have `traceability: true` when `traceability.capabilities`
opts it in, as `osq report` decides. Only opted-in capabilities SHALL bring
test and function nodes and these edges:

- a `function` node for each exported function the scenario index holds in a
  file the capability owns that is neither a test path nor a scenario test
  file, with an `owns` edge from the capability to it;
- a `function` node for each exported function with a `@scenario` tag naming a
  scenario in the capability's living spec, with a `serves` edge from the
  function to that scenario;
- a `test` node for each scenario test file with a `scenario(...)` call naming
  a scenario in the capability's living spec, with a `proves` edge from the
  test to that scenario;
- a `covers` edge from a test node to a function node when the scenario index
  says the test covers the function;
- a `follows` edge from a function node to an ADR node for each `@adr` tag
  whose number is that ADR's by `sameAdrNumber`. A tag naming no ADR SHALL add
  no edge; the function's `adrs` still lists it.

A function node's `survivors` SHALL be the surviving mutants that the report's
mutation scores list for its file and function, read from active and archived
changes, each once; it is empty when there are none.

#### Scenario: Pricing sample
- **WHEN** the graph is built for the pricing sample with `pricing` opted in
- **THEN** it holds `test:tests/pricing-quote.test.ts` proving the pricing scenarios and covering `function:src/pricing/quote.ts#quote`, which serves them, follows `adr:001`, and has an `owns` edge from `capability:pricing`

#### Scenario: Surviving mutant on a function
- **WHEN** an archived change's task stream holds a measured `mutation_ran` event for `src/pricing/quote.ts#quote` with one survivor
- **THEN** the `quote` function node's `survivors` holds that survivor

#### Scenario: Unknown ADR tag
- **WHEN** a function carries `@adr 009` and no ADR 009 exists
- **THEN** its `adrs` lists `009` and it has no `follows` edge

#### Scenario: Capability not opted in
- **WHEN** `pricing` is not opted in
- **THEN** its node has `traceability: false` and `gaps: null`, and the graph holds no test or function node from it

#### Scenario: Two thousand scenarios
- **WHEN** the graph is built for a synthetic opted-in project with 2,000 scenarios, each proved by a test
- **THEN** it holds 2,000 scenario nodes and 2,000 `proves` edges, no scenario is a gap, and building it twice gives the same output

### Requirement: System graph gaps
<!-- source: src/core/web/system-graph*.ts, tests/web-system-graph*.test.ts -->
The graph SHALL mark gaps on nodes, and `gap` SHALL be null on every scenario
and function node that is not one:

- A scenario of an opted-in capability that no scenario test file names SHALL
  have `gap: "untested"`.
- A function an opted-in capability owns, by "System graph traceability",
  with no `@scenario` tag SHALL have `gap: "unclaimed"`.
- Every file of the import graph, built with the OpenSpec root skipped, that
  no capability's Code ownership covers SHALL be a `file` node with
  `gap: "unowned"` and no edges. No other file SHALL be a `file` node.

An opted-in capability's `gaps` SHALL be `{ untested, unclaimed }`, the
number of its scenarios and functions with those gaps. They SHALL equal the
counts `osq report` gives the same capability under `traceability`. A
capability not opted in SHALL have `gaps: null`.

#### Scenario: Untested and unclaimed
- **WHEN** opted-in `pricing` has a scenario no test names and an exported function with no `@scenario` tag in a file it owns
- **THEN** the scenario has `gap: "untested"`, the function `gap: "unclaimed"`, and `capability:pricing` has `gaps` counting one of each

#### Scenario: Same counts as the report
- **WHEN** the report and the graph are built for the same opted-in project
- **THEN** each capability's `gaps` equals its untested-scenario and unclaimed-function counts in the report

#### Scenario: Unowned file
- **WHEN** `scripts/seed.ts` is covered by no capability's Code ownership
- **THEN** the graph holds `file:scripts/seed.ts` with `gap: "unowned"`, and no owned file is a `file` node

## MODIFIED Requirements

### Requirement: Read-only HTTP transport
<!-- source: src/core/web-server*.ts, src/core/web-static.ts, src/cli/serve.ts, tests/serve.test.ts -->
One Node `http` server SHALL expose `GET /api/report`, `GET /api/graph`,
`GET /api/system`, `GET /api/changes/<id>`, `GET /api/inbox`,
`GET /api/events`, and production static assets. Every ordinary API request
SHALL recompute its document from files and retain no cache after the
response.

The report response SHALL be the exact `MetricsReport` from
`getMetricsReport`, without a wrapper or web-only field. The inbox response
SHALL read the existing last-look cursor and equal a contemporaneous first
`osq --json` projection for the same filesystem and clock, but the HTTP request
SHALL not advance the cursor. Graph and change responses SHALL use the stable
web documents. The system response SHALL be the `SystemGraph` from
`getSystemGraph`, without a wrapper. JSON APIs SHALL use UTF-8, deterministic
serialization, and `Cache-Control: no-store`; failures SHALL return JSON 4xx
or 5xx responses without terminating the server.

GET and HEAD SHALL be the only supported methods. HEAD SHALL return its GET
status and headers without a body. Every other method on every path SHALL
return 405 with `Allow: GET, HEAD`, before route lookup, and no state change.
An unknown API GET SHALL return 404. No response SHALL enable cross-origin
resource sharing.

Change selectors SHALL be decoded once and reject path separators, traversal,
or malformed percent encoding. An absent selector SHALL return 404 and an
ambiguous numeric selector 409.

#### Scenario: Report and inbox parity
- **WHEN** API and existing core or CLI projections observe the same fixture and clock
- **THEN** their report and inbox objects are deeply equal while the API leaves last-look state unchanged

#### Scenario: Mutation method is refused
- **WHEN** a client sends POST, PUT, PATCH, or DELETE to any known or unknown path
- **THEN** the server returns 405 with the allowed read methods and changes no file

#### Scenario: Malformed change selector
- **WHEN** a change URL decodes to a separator, traversal, or invalid encoding
- **THEN** the server returns a JSON 400 response without reading outside canonical change roots

#### Scenario: System document
- **WHEN** a client requests `GET /api/system` on a fixture project
- **THEN** the body is `serializeWebJson` of `getSystemGraph` for that project, with `Cache-Control: no-store`
