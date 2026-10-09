# web-inspection Specification

## Purpose

Provides a local read-only HTTP and browser projection of osq's filesystem
state for delivery reporting, capability history, and detailed change evidence.

## Requirements

### Requirement: Stable web inspection documents
The web inspection core SHALL derive `WebGraph` and `WebChange` documents from
the current project tree and SHALL compose the established proposal and task
parsers, marker-state derivation, deterministic scope resolver, planning
reader, report event semantics, and show projection. It SHALL not introduce a
second authoritative state, persist an index, or estimate absent observations.

`WebGraph` SHALL contain deterministically ordered capability and change nodes
and typed edges. A capability node SHALL come from a current
`openspec/specs/<capability>/spec.md` folder and contain its id and complete
spec text. A change node SHALL come from each active, archived, and rejected
change folder and contain a stable folder key, numeric id, slug, title,
location-derived state, nullable created, approved, landed, rejection, and
planner metadata, task count, attempts, and a compact observed metric summary.

The summary SHALL carry separate execution and planning cost plus `reported of
total` coverage, recorded tokens grouped by harness and model with cached
input retained, covered task-duration values, and a first-attempt task pass
numerator and denominator. No valid planning start SHALL mean null planning
cost rather than zero. An edge SHALL be emitted once as `depends_on` from a
change to a present change, `reads` from a change to a capability named in
`features.reads`, or `writes` from a change to each capability delta folder.

`WebChange` SHALL resolve one unambiguous active, archived, or rejected change
by numeric id or stable folder key. It SHALL contain location, title, state,
nullable planner, nullable brief body, proposal goal, and an `asOf` timestamp.
Each task SHALL contain its title, declared scope, currently resolved scope
files, acceptance lines, verify command, current state, attempts, nullable dead
or regressed reason, nullable running start and elapsed seconds, observed
duration and cost with coverage, typed recertifications with `actor: human`,
and verbatim result text when present. Missing or malformed optional history
SHALL become null or empty fields without hiding valid evidence.

#### Scenario: Graph contains every location
- **WHEN** capabilities plus active, archived, and rejected changes exist
- **THEN** graph nodes and their dependency, read, and delta-folder write edges are complete and deterministic

#### Scenario: Per-change chart observations
- **WHEN** task and planning streams contain partial recorded usage
- **THEN** the change node exposes only observed grouped values and exact coverage denominators while missing planning history remains null

#### Scenario: Detailed recertified task
- **WHEN** a task has declared and resolved scope, execution events, a result, and a typed recertification
- **THEN** change detail exposes all recorded fields and labels the recertification actor as human without inference

#### Scenario: Ambiguous or absent change
- **WHEN** a selector matches several preserved folders or no folder
- **THEN** derivation reports ambiguity or absence rather than choosing by filesystem enumeration order

### Requirement: Server-sent invalidation
The server SHALL own exactly one chokidar watcher covering the configured
OpenSpec root and discovered `.run` directories. It SHALL accumulate file
notifications for `serve.eventDebounceMs` and send every connected events
client one SSE event named `changed`, whose JSON data contains the sorted
unique numeric ids of affected change folders. A notification outside one
change, including a living capability change, SHALL use an empty id list.

The event SHALL contain no report, graph, change, file content, or other state.
The browser SHALL treat it only as an invalidation and refetch through the data
module. Server shutdown SHALL close the chokidar watcher, pending debounce,
open SSE responses, and HTTP listener; a failed startup SHALL leave none of
those resources active.

#### Scenario: Debounced change notifications
- **WHEN** several paths in one change are modified inside one debounce interval
- **THEN** every connected client receives one changed event naming that change once

#### Scenario: Capability invalidation
- **WHEN** a living capability spec changes
- **THEN** clients receive one changed event with no affected change id and can refetch shared documents

#### Scenario: Clean shutdown
- **WHEN** the server closes with connected events clients and a pending debounce
- **THEN** the listener, watcher, timer, and response streams all terminate

### Requirement: Static UI boundary
Production assets SHALL be served only from the package-root directory returned
by `resolveUiDir()`. Resolution SHALL decode paths safely, require the resolved
regular file to remain within that directory, reject traversal and directory
listing, and serve established content types. `/` and `/index.html` SHALL
return the hash-routed application shell. The index SHALL revalidate while
fingerprinted assets MAY use immutable caching.

The HTML response SHALL use a self-only content security policy compatible
with the generated build. The application SHALL use system fonts and same-
origin APIs and SHALL make no external request.

#### Scenario: Packaged index
- **WHEN** a consumer requests `/` from an installed package
- **THEN** the server returns the staged index and its same-origin fingerprinted assets with correct types

#### Scenario: Static path escape
- **WHEN** an encoded or literal path would leave `ui/dist`
- **THEN** static serving rejects it without disclosing a file or directory listing

### Requirement: Typed UI data boundary
The React application SHALL have one data module that owns every report, graph,
inbox, change, and events access, and one server status client that owns the
`api/server` access. When typed `window.__OSQ_DATA__` exists, the
module SHALL prefer its report, graph, inbox, and keyed change documents;
otherwise it SHALL use only same-origin `/api/*` fetches, prefixed with
`/p/<project>` when the page is served under `/p/<project>/`. UI components
SHALL receive documents and callbacks and SHALL NOT invoke fetch or construct
an EventSource.

The UI SHALL import `MetricsReport`, `Inbox`, `WebGraph`, and `WebChange` using
`import type` only. No module below `src/` SHALL import from `packages/ui`, and
no module below `packages/ui` SHALL import a runtime value from `src/`. The
application SHALL use a small hash route for home, changes list, report, graph,
and change views, with no routing or state-management dependency. The empty
hash and `#/` SHALL open home, and an unknown hash SHALL fall back to home.

On a `changed` event, the data layer SHALL refetch report, graph, and inbox plus
the open change when its id is listed or the id list is empty. It SHALL not
interpret paths, markers, or event payloads as application state.

#### Scenario: Static inlined documents
- **WHEN** the global data document contains the selected route's inputs
- **THEN** the view renders without a fetch or events connection

#### Scenario: Live invalidation
- **WHEN** an SSE changed event affects the selected change
- **THEN** the data layer refetches common documents and that change before updating the view

#### Scenario: Architecture boundary
- **WHEN** import-graph verification scans CLI and UI sources
- **THEN** dependency direction and type-only core imports satisfy the one-way boundary

### Requirement: Delivery report visualization
The report view SHALL render five question-labeled inline SVG charts from the
unchanged `MetricsReport` and graph-node observations: execution and planning
cost per change as horizontal bars, one row per change in descending change
number, with the change name on the row axis; tokens by recorded model and
harness with cache share; first-attempt task pass rate in consecutive landed
windows of at most five changes; covered task-duration distribution; and
cumulative writes per capability over landed changes.

Every cost value SHALL display its exact `n of m` coverage adjacent to the
number. Planning cost SHALL be absent before the first valid planning record
and that boundary SHALL be marked rather than rendered as historical zero.
Unavailable or partially covered evidence SHALL remain visibly unavailable or
partially covered without estimation.

No two axis labels in any chart SHALL overlap. A change label that does not fit
SHALL be shortened or thinned, and the full change name SHALL remain available
in the element's SVG title.

The report SHALL also render legacy and resolver-2 scope-file evidence as two
separately labeled series with their boundary, preserve the combined
acceptance-line evidence, and show all five scope-regression counters in a
compact table. It SHALL never merge or compare scope sizes across resolver
generations.

#### Scenario: Five operational questions
- **WHEN** report and graph fixtures contain landed observations
- **THEN** five SVG figures render with headings, deterministic marks, and text alternatives matching their stated questions

#### Scenario: Cost coverage
- **WHEN** an execution or planning value has partial coverage
- **THEN** the displayed value is immediately accompanied by its recorded n-of-m coverage

#### Scenario: Planning starts after execution history
- **WHEN** old changes lack planning records and a later change has one
- **THEN** the planning stack begins at a labeled boundary without leading zero marks

#### Scenario: Many changes
- **WHEN** the report renders fifty changes
- **THEN** the cost chart has fifty labeled bar rows and the writes chart's axis labels do not overlap

### Requirement: Capability archive graph visualization
The graph view SHALL use application-owned inline SVG with one horizontal lane
per current capability and archived changes ordered left to right by change
number, so that a change without a recorded landed date still gets a mark.
A change mark SHALL connect every lane named by its writes edges. Active
changes SHALL occupy a visually distinct right edge. Rejected changes SHALL be
hidden by default and exposed by a labeled toggle. Lane labels SHALL show the
complete capability name.

Depends-on and reads edges SHALL use distinguishable, visibly stroked styles
and independent visibility controls. A fill control SHALL switch change marks
between observed cost and attempt encodings while retaining an unavailable
treatment for absent coverage. Hover or keyboard focus SHALL expose title,
landed date or its absence, planner, tasks, attempts, cost, and coverage.
Activating a change SHALL navigate to its change route; activating a lane label
SHALL expose the current complete capability spec text contained in the graph
document.

The graph SHALL remain operable through labeled controls and focusable nodes,
and its SVG region SHALL scroll horizontally instead of collapsing below the
usable narrow-window width.

#### Scenario: Writes span capability lanes
- **WHEN** one change has two writes edges
- **THEN** one focusable change mark visibly connects both lanes and its accessible label names both writes

#### Scenario: Edge and encoding controls
- **WHEN** reads, dependencies, rejected visibility, or fill metric is toggled
- **THEN** the requested visual layer changes without mutating source data

#### Scenario: Living capability text
- **WHEN** a lane label is activated
- **THEN** the graph view displays that capability node's current complete spec text

#### Scenario: Undated archived changes
- **WHEN** archived changes lack a landed time and depend on each other
- **THEN** each gets a mark in change-number order and their dependency edge is drawn

### Requirement: Change evidence visualization
The change view SHALL render the brief body when present and otherwise the
proposal goal under a visible `brief absent` label. It SHALL show nullable
planner attribution and a task table with state, attempts, reason, duration,
cost, and cost coverage.

Each task SHALL expose its declared and resolved scope, acceptance lines,
verify command, human recertifications, and result text. Result text SHALL be
verbatim and collapsed initially in a native disclosure control. Missing
planner, reason, duration, cost, brief, result, or recertification evidence
SHALL be labeled unavailable or empty and SHALL not be inferred.

A running task SHALL show the elapsed seconds computed by the server. A
relevant changed event SHALL cause the data module to refetch the document, so
the view updates state and elapsed time without reading markers in the browser.

#### Scenario: Brief absent
- **WHEN** a change document has no brief body
- **THEN** the view labels the brief absent and renders the proposal goal

#### Scenario: Folded result evidence
- **WHEN** a task has result text
- **THEN** the exact text is present inside a disclosure control that is closed initially

#### Scenario: Running change refresh
- **WHEN** a changed event affects the open running change
- **THEN** the view receives a freshly derived task state and elapsed value

### Requirement: Frontend dependency and size boundaries
The browser application SHALL be a private strict-TypeScript pnpm workspace at
`packages/ui`, built on the Node 24 LTS project toolchain with React, React DOM,
and Vite as build-time dependencies.
It SHALL use Vite's TypeScript and JSX pipeline directly, a local hash router,
application-owned SVG scales and paths, and no React plugin, chart library,
d3 package, router, state library, test framework, or runtime server package.

The production output staged below `ui/dist` SHALL total no more than
1,000,000 bytes across regular files. Every non-grandfathered source file below
`packages/ui` SHALL contain at most 250 lines. Root verification SHALL
typecheck, test, lint, and production-build the CLI and UI before enforcing the
staged asset, import, and line budgets.

The UI SHALL remain usable at narrow widths, use no external asset, respect
`prefers-color-scheme`, and expose chart and graph meaning through headings,
labels, controls, and text in addition to color.

#### Scenario: Lean workspace graph
- **WHEN** workspace manifests and the production bundle are inspected
- **THEN** only the decided React and Vite build stack is present and no frontend package is a CLI runtime dependency

#### Scenario: Asset or source budget regression
- **WHEN** staged files exceed one million bytes or a new UI source exceeds 250 lines
- **THEN** `pnpm verify` fails with the offending measurement

#### Scenario: Narrow dark-mode rendering
- **WHEN** the page is viewed at a narrow width with a dark color preference
- **THEN** navigation, controls, tables, and horizontally scrollable SVG views remain readable and usable

### Requirement: Code ownership
<!-- source: src/core/web/**, packages/ui/**, tests/serve*.test.ts, tests/web*.test.ts, tests/ui*.test.ts, tests/fixtures/web/** -->
The Web Inspection capability SHALL own read-only web document composition,
HTTP routing and static delivery, SSE invalidation, the browser application,
and their focused fixtures and tests. CLI command registration, public
configuration, root workspace packaging, and release smoke coverage SHALL
remain owned by CLI Foundation. Existing report, inbox, show, parser, scope,
state, and planning modules SHALL remain authoritative for their established
contracts and SHALL not depend on Web Inspection.

#### Scenario: Codebase ownership boundaries
- **WHEN** ownership is resolved for dashboard core or browser files
- **THEN** `src/core/web/**`, `packages/ui/**`, focused web tests, and web fixtures map to web-inspection while existing core capabilities retain their dependency direction

### Requirement: Unreported web cost
A change node's execution cost and planning cost, and a task's observed cost,
SHALL be null when no counted attempt or session reported a cost, even if
attempts or sessions exist or reported tokens. Planning cost coverage SHALL
count only sessions that reported a cost, out of all sessions. A partially
reported cost SHALL remain the sum of reported values.

#### Scenario: Sessions without cost
- **WHEN** a change has planning sessions and none reported a cost
- **THEN** its planning cost is null and its coverage is `{ reported: 0, total: N }`

#### Scenario: Sessions with tokens but no cost
- **WHEN** a change's planning sessions reported tokens and none reported a cost
- **THEN** its planning cost is null, its coverage is `{ reported: 0, total: N }`, and the dashboard shows `not reported`

### Requirement: Honest dashboard labels
The dashboard SHALL format every cost through one shared function. A null
cost, or a cost with zero reported coverage, SHALL read `not reported`. The
brief panel's heading SHALL be `Brief` alone, followed by a plain note when the
change has no brief. The repository totals SHALL show the unmarked count when
it is above zero.

#### Scenario: Unreported cost in the dashboard
- **WHEN** a view renders a null cost or a cost with zero reported coverage
- **THEN** it shows `not reported`, never `$0.0000` or `unavailable`

#### Scenario: Change without a brief
- **WHEN** a change has no brief
- **THEN** the panel heading reads `Brief` and a note under it says the proposal goal is shown instead

### Requirement: Change task progress
Each `WebGraph` change node SHALL carry `doneCount`, the number of its tasks
with a done marker, next to `taskCount`. The count SHALL come from the same
marker derivation as `osq status`.

#### Scenario: Partly done change
- **WHEN** an active change has three tasks and one done marker
- **THEN** its node has `taskCount` 3 and `doneCount` 1

### Requirement: Dashboard home
The home view SHALL render the `Inbox` document in three groups: Needs you,
Running, and Landed. Each needs-you item SHALL show its kind in words, its
change and task, and its exact `command` as code, and link to its change page.
Running items SHALL show their task and elapsed time. Landed items SHALL show
their archive time and SHALL be labelled as landed since the last `osq` look.
Each empty group SHALL say so in one line.

#### Scenario: Needs you
- **WHEN** the inbox holds a dead task
- **THEN** home shows it under Needs you with its `osq retry <id> <n>` command

#### Scenario: Quiet repository
- **WHEN** all three groups are empty
- **THEN** home shows one empty-state line per group and no error

### Requirement: Changes list
The `#/changes` view SHALL render one table row per `WebGraph` change node, with
the change id and title linking to its change page, a state of `awaiting
approval`, `in progress`, `archived`, or `rejected`, tasks as `doneCount of
taskCount`, execution and planning cost through the shared cost formatter, and
the landed date or a dash. Active changes SHALL come first, then the rest, each
group by descending id.

#### Scenario: Approved active change
- **WHEN** an active change has an approved time and two of four tasks done
- **THEN** its row reads `in progress` and `2 of 4`

### Requirement: Dashboard status palette and hierarchy
Every task status in the dashboard SHALL render through one status
badge: a dot in the status color followed by the status word. `styles.css`
SHALL define one palette as custom properties for verified, dead, regressed,
running, and pending, each with a light value and a `prefers-color-scheme:
dark` value. Tables SHALL be left-aligned, full-width within the content
column, with right-aligned tabular numbers and a distinct header row. Headings
SHALL set the hierarchy through size and weight.

#### Scenario: Same status, every view
- **WHEN** a dead task appears on the home view and on its change page
- **THEN** both render the same badge with the word `dead`

### Requirement: Static dashboard export
`exportDashboard` SHALL write the built UI into an empty or missing target
directory, together with a `data.js` that assigns `window.__OSQ_DATA__` and an
`index.html` that loads `data.js` before the application bundle. The inlined
documents SHALL be the report, graph, and inbox, plus every active, archived,
and rejected change document, keyed by its folder key and by its id prefix.
Every string in them SHALL have the absolute project root replaced by `.` and
then the home directory replaced by `~`. The built UI SHALL reference its
assets through relative paths. A non-empty target SHALL be refused without
writing.

#### Scenario: Offline snapshot
- **WHEN** a fixture project is exported
- **THEN** the target holds `index.html`, `data.js`, and the assets, and `data.js` covers every route's documents

#### Scenario: Scrubbed paths
- **WHEN** captured output contains the project root and home directory
- **THEN** no written file contains either absolute path

#### Scenario: Occupied target
- **WHEN** the target directory contains a file
- **THEN** the export fails naming the directory and writes nothing

### Requirement: Inbox kind labels
The dashboard's needs-you group SHALL label `planning` items `needs planning`,
as it labels the other kinds. It SHALL have no label for a verification kind,
because the inbox has none.

#### Scenario: Planning label
- **WHEN** `needsYouKindLabel('planning')` is called
- **THEN** it returns `needs planning`

### Requirement: Invalidation across worktrees
`osq serve` SHALL resolve the change trees through `changeTrees` once at
startup and pass them to the invalidation hub. The hub SHALL watch the
configured OpenSpec root of the first tree and the change folder of each
worktree tree. A notification inside a worktree tree's change folder SHALL
invalidate that change's numeric id. Without resolved trees, the hub SHALL
watch the project root's OpenSpec root as before.

#### Scenario: Edit in a worktree folder
- **WHEN** a file inside a worktree tree's change folder `001-a` changes
- **THEN** connected clients receive one changed event with ids `[1]`

#### Scenario: Server wiring
- **WHEN** `startWebServer` starts with `vcs.enabled` and one osq worktree
- **THEN** the hub's watcher is given the OpenSpec root and that worktree's change folder

### Requirement: Capability groups in the graph
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

### Requirement: System graph document
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

### Requirement: Loopback HTTP transport
One Node `http` server SHALL expose `GET /api/report`, `GET /api/graph`,
`GET /api/system`, `GET /api/changes/<id>`, `GET /api/inbox`,
`GET /api/events`, and production static assets. When `startWebServer` is
given a `runAction`, it SHALL also expose `GET /api/actions/<id>` and
`POST /api/actions/<id>`, which "Loopback write actions" defines. Every
ordinary API request SHALL recompute its document from files and retain no
cache after the response.

The report response SHALL be the exact `MetricsReport` from
`getMetricsReport`, without a wrapper or web-only field. The inbox response
SHALL read the existing last-look cursor and equal a contemporaneous first
`osq --json` projection for the same filesystem and clock, but the HTTP request
SHALL not advance the cursor. Graph and change responses SHALL use the stable
web documents. The system response SHALL be the `SystemGraph` from
`getSystemGraph`, without a wrapper. JSON APIs SHALL use UTF-8, deterministic
serialization, and `Cache-Control: no-store`; failures SHALL return JSON 4xx
or 5xx responses without terminating the server.

GET and HEAD SHALL be supported on every path. HEAD SHALL return its GET
status and headers without a body. POST SHALL be supported only on
`/api/actions/<id>` and only when the server has a `runAction`. Every other
method on that path SHALL return 405 with `Allow: GET, HEAD, POST`. Every
method other than GET and HEAD on every other path, and on every path when
the server has no `runAction`, SHALL return 405 with `Allow: GET, HEAD`,
before route lookup, and no state change. An unknown API GET SHALL return
404; without a `runAction`, `/api/actions/<id>` is unknown. No response SHALL
enable cross-origin resource sharing.

Change selectors SHALL be decoded once and reject path separators, traversal,
or malformed percent encoding. An absent selector SHALL return 404 and an
ambiguous numeric selector 409.

#### Scenario: Report and inbox parity
- **WHEN** API and existing core or CLI projections observe the same fixture and clock
- **THEN** their report and inbox objects are deeply equal while the API leaves last-look state unchanged

#### Scenario: Mutation method is refused
- **WHEN** a client sends POST, PUT, PATCH, or DELETE to any path other than `/api/actions/<id>`, or to any path on a server without a `runAction`
- **THEN** the server returns 405 with `Allow: GET, HEAD` and changes no file

#### Scenario: Malformed change selector
- **WHEN** a change URL decodes to a separator, traversal, or invalid encoding
- **THEN** the server returns a JSON 400 response without reading outside canonical change roots

#### Scenario: System document
- **WHEN** a client requests `GET /api/system` on a fixture project
- **THEN** the body is `serializeWebJson` of `getSystemGraph` for that project, with `Cache-Control: no-store`

#### Scenario: Other method on the actions path
- **WHEN** a client sends PUT to `/api/actions/001` on a server with a `runAction`
- **THEN** the server returns 405 with `Allow: GET, HEAD, POST` and calls no action

### Requirement: Loopback write actions
`startWebServer` SHALL take an optional `runAction`, a `WebActionRunner`
from `src/core/web/web-actions.ts`, and SHALL never import from `src/cli/`.
Each server SHALL create one token of 32 random bytes from `node:crypto`,
hex-encoded, when it starts. A request's host is allowed when its `Host`
header is `127.0.0.1:<port>` or `localhost:<port>`, with `<port>` the bound
port, or exactly equals an entry of the server config's `serve.allowedHosts`;
an origin is allowed when it is `http://` or `https://` followed by an
allowed host. The server SHALL still bind only `127.0.0.1`; no setting binds
another address.

`GET /api/actions/<id>` SHALL return 403 with
`{"error":"request refused"}` when the host is not allowed or an `Origin`
header is present and not allowed. Otherwise it SHALL return the
`WebActions` document from `getWebActions` for that change with a `token`
field holding the server's token.

`getWebActions(projectRoot, selector, config)` SHALL resolve the change with
`resolveChangeFolder` and read `readDispatchItems`. For each command of the
items whose folder is that change's folder key, in item order: `osq approve
<id>`, `osq land <id>`, `osq reject <id> --reason <text>`, and
`osq retry <id> <target>` SHALL each be one action with its verb, the
command, and the retry target or null; `osq show <id>` SHALL be left out; any
other command SHALL be listed in `manual`. When there is no such item and the
change's `readNextStep` state is `unplanned`, `manual` SHALL hold that next
step's command. Repeated commands SHALL appear once.

`POST /api/actions/<id>` SHALL be refused with 403 and
`{"error":"write request refused"}`, before its body is read and before any
state changes, unless the host is allowed, the `Origin` header is present and
allowed, the `Content-Type` media type is `application/json`, and the
`X-Osq-Token` header equals the server's token under a constant-time compare.
A selector that fails decoding SHALL then return 400. While another action
runs on the same server, the request SHALL return 409 with
`{"error":"another action is running"}` and SHALL not be queued. The body
SHALL be a JSON object with `verb` one of `approve`, `land`, `reject`, or
`retry`, a non-empty string `reason` for `reject`, and a non-empty string
`target` for `retry`; an `approve` body MAY carry `opened`, a list of strings.
Any other body SHALL return 400 with an error naming what is wrong, and no
action runs. A valid request SHALL call `runAction` once with the verb, the
decoded selector as `change`, the reason or target, and for `approve` the
`opened` list only when the body carries one, and SHALL return 200 with the
`WebActionResult` it resolves to, whatever its exit code. When `runAction`
rejects, the server SHALL return 500.
The running action SHALL end, by result or failure, before the next one can
start.

#### Scenario: Actions for an approval
- **WHEN** a client with an allowed host requests `GET /api/actions/001` for a change ready for approval
- **THEN** the body holds the token, the action `approve` with command `osq approve 001`, and an empty `manual`

#### Scenario: Unplanned change shows plan
- **WHEN** a client requests the actions of an unapproved change that has a brief and the planning sentinel verify
- **THEN** there is no action and `manual` is `osq plan <id>`

#### Scenario: Foreign host
- **WHEN** a request to `/api/actions/001` carries `Host: evil.example:<port>`
- **THEN** the server returns 403, sends no token, and calls no action

#### Scenario: Write without proof
- **WHEN** a POST to `/api/actions/001` lacks the token, carries a wrong token, lacks `Origin`, carries another site's `Origin`, or is not `application/json`
- **THEN** the server returns 403, does not call `runAction`, and changes no file

#### Scenario: Valid write
- **WHEN** osq's page posts `{"verb":"retry","target":"2"}` to `/api/actions/001` with the token, an allowed host and origin
- **THEN** `runAction` receives `retry` for change `001` with target `2`, and the response is 200 with its result

#### Scenario: One write at a time
- **WHEN** a second valid POST arrives while the first action has not finished
- **THEN** the second returns 409 without calling `runAction`, and a POST after the first finishes runs

#### Scenario: Bad body
- **WHEN** a valid POST carries invalid JSON, an unknown verb, `reject` without a reason, or `retry` without a target
- **THEN** the server returns 400 and does not call `runAction`

#### Scenario: Approve with opened notices
- **WHEN** osq's page posts `{"verb":"approve","opened":["rules_path"]}` to `/api/actions/001` with the token, an allowed host and origin
- **THEN** `runAction` receives `approve` for change `001` with `opened` `["rules_path"]`, while `{"verb":"approve","opened":"rules_path"}` returns 400 without calling it

#### Scenario: Configured host behind a proxy
- **WHEN** `serve.allowedHosts` is `['box.tail1234.ts.net']` and a POST to `/api/actions/001` carries `Host: box.tail1234.ts.net`, `Origin: https://box.tail1234.ts.net`, the token, and `application/json`
- **THEN** `runAction` is called once and the response is 200

#### Scenario: Hosts judged against the list
- **WHEN** a `GET /api/actions/001` carries each `Host` below, with no `Origin`, on a server bound to port 4180
- **THEN** the status is the one in the table:

| `serve.allowedHosts` | `Host` | Status |
|---|---|---|
| `[]` | `127.0.0.1:4180` | 200 |
| `[]` | `box.tail1234.ts.net` | 403 |
| `['box.tail1234.ts.net']` | `box.tail1234.ts.net` | 200 |
| `['box.tail1234.ts.net']` | `box.tail1234.ts.net:4180` | 403 |
| `['box.tail1234.ts.net:8443']` | `box.tail1234.ts.net:8443` | 200 |
| `['box.tail1234.ts.net']` | `evil.example` | 403 |

### Requirement: Change actions
The change view SHALL show, when the dashboard is served by `osq serve` and
not a static export, one button per action of the change's `WebActions`:
`Approve`, `Land`, `Reject` with a reason text field that must be non-empty,
and `Retry task <n>` or `Retry change`. Each `manual` command SHALL show as
text to run in a shell. A tap SHALL post one request with the document's
token, disable every button until it answers, then show the exit code, the
captured stdout and stderr, and on failure the error message and its
`Next:` step, and load the actions again. A 409 answer SHALL show that
another action is running. The actions SHALL load again whenever a fresh
change document arrives. A static export SHALL make no actions request and
show no buttons.

`createActionClient(fetch)` in `packages/ui/src/change/actions-client.ts`
SHALL load `GET /api/actions/<id>`, giving null on 404, and post a
`WebActionRequest` without `change` as JSON with `Content-Type:
application/json` and `X-Osq-Token`.

#### Scenario: Approval buttons
- **WHEN** the change view renders actions holding `approve` and a `manual` `osq plan 001`
- **THEN** it shows an `Approve` button and the text `osq plan 001`, and no other button

#### Scenario: Result after a tap
- **WHEN** a tap answers with exit code 1, an error message, and next step `osq retry 001 2`
- **THEN** the view shows the exit code, the message, and `Next: osq retry 001 2`

#### Scenario: Static export has no buttons
- **WHEN** the change view renders without an action client
- **THEN** it shows no action button and makes no actions request

### Requirement: Approve review document
`WebChange` SHALL carry `review`, a `WebReview` for an active change without
`.run/approved` and null for every other change. `getWebChange` SHALL always
set it; the type declares it optional so documents built before it stay
valid, and a missing `review` SHALL mean the same as null.

A `WebReview` SHALL hold the proposal's `goal`, `nonGoals`, `surface`,
`decisions`, `humanSteps` (the whole `## Human steps` section) and `contract`
as trimmed text with HTML comments removed, empty when absent; `deltas`; the
change's approval `digest` with its `flags`; and `digestText`, the digest body
`formatApprovalDigest` renders.

`deltas` SHALL hold one entry per capability folder under the change's
`specs/` with a `spec.md`, sorted by name, each listing its requirements in
the order added, modified, removed, renamed, and within each in delta order.
Each requirement SHALL carry its `operation`, its `name` (the new name for a
rename), `from` (the old name for a rename, else null), `proposed` (the
delta's verbatim block for added and modified, else null), and `living` (the
verbatim block `osq spec <capability> <requirement>` prints for the living
requirement it modifies, removes or renames, null for added or when no living
requirement matches). No field SHALL be estimated or diffed.

#### Scenario: Modified requirement carries its living text
- **WHEN** an unapproved change's delta modifies a living requirement
- **THEN** its review entry holds the proposed block and the living block `osq spec` prints

#### Scenario: Added, removed and renamed requirements
- **WHEN** the delta adds one requirement, removes one living requirement and renames another
- **THEN** the added entry has a null `living`, the removed entry has a null `proposed` and the living block, and the renamed entry has `from`, the new `name` and the old living block

#### Scenario: Proposal sections without template comments
- **WHEN** the proposal's Surface section holds the template's HTML comment and one line
- **THEN** `review.surface` is that line alone

#### Scenario: Approved change has no review
- **WHEN** the change has `.run/approved`, or is archived or rejected
- **THEN** `review` is null

### Requirement: Approve review view
For a change document with a `review`, the change view SHALL show, after the
header and brief, the sections `Goal`, `Non-goals`, `Surface`, `Decisions`,
`Human steps` and `Contract`, then `Deltas`, then the task table, then
`Approval digest`, then the actions. Section and requirement text SHALL be
plain preformatted text that wraps at narrow widths; no Markdown is rendered.
An empty section SHALL show `None`.

Each delta requirement SHALL show its operation and name, with the living
text and the proposed text side by side, stacked at narrow widths. An added
requirement's living side SHALL read `New requirement`, a removed one's
proposed side `Removed`, and a renamed one shows `Renamed from <from>` with
the living text. A requirement with no living match SHALL say so.

The digest section SHALL show `digestText`. When the dashboard has actions,
each flag's label and excerpt SHALL show inside the Approve button's item, or
above the buttons when there is no approve action; without actions, the
digest section SHALL list the flags. A change document without a `review`
SHALL render exactly as before this requirement.

#### Scenario: Review in order
- **WHEN** the change view renders a document with a review
- **THEN** the headings appear in the order Goal, Non-goals, Surface, Decisions, Human steps, Contract, Deltas, Tasks, Approval digest

#### Scenario: Flag beside Approve
- **WHEN** the actions hold `approve` and the review digest has a flag
- **THEN** the flag's label and excerpt render inside the Approve button's item

#### Scenario: Reviewed change unchanged
- **WHEN** the change view renders a document whose `review` is null or missing
- **THEN** the markup equals the markup it rendered before this requirement

#### Scenario: Phone width
- **WHEN** the review is viewed at a narrow width
- **THEN** its text wraps and each living and proposed pair stacks without horizontal page scroll

### Requirement: Land view document
`WebChange` SHALL carry `land`, the `LandView` that `readLandView` returns
for an archived change and null for every other change. `getWebChange` SHALL
always set it from the details it already builds; the type declares it
optional so documents built before it stay valid, and a missing `land` SHALL
mean the same as null.

#### Scenario: Archived change document
- **WHEN** `GET /api/changes/<id>` serves an archived change
- **THEN** its `land` equals `readLandView` for the same change

#### Scenario: Active change document
- **WHEN** the change is active or rejected
- **THEN** `land` is null

### Requirement: Land view
For a change document with a `land`, the change view SHALL show a `Land`
section after the brief and before the actions and the task table, readable
at phone width, holding:

- a headline: `Landed`; `Git is off`; `Not landed. <branch> has <n> new
  commits since archive; Land will merge them and run verify again`;
  `Not landed. <branch> has not moved since archive`; or `Not landed. Branch
  osq/<folder> not found`, with `commit` for one commit
- `Gates at archive`: one item per gate with its name (`Task <n>`, `Verify`,
  `Check` or `Validator`), outcome, duration in whole seconds, the exit code
  of a failed gate, the validator's finding count, and its command as code;
  `None recorded` without gates
- `Diff`: `<files> files changed, +<added> -<removed>`, or `Unavailable`
- `Spec changes`: per capability its added, modified, removed and renamed
  requirement names, a rename as `<from> → <to>`; `None` without any
- `Executor disclosures`: per task its deviated and outside-scope text as
  plain preformatted text that wraps; `None` without any
- `Halted` with the reason and message when `halt` is set, and `Sync stopped`
  with the reason and message when `lastSyncStop` is set

The Land button stays the existing `land` action, and its result shows as
every action result does. A landed change SHALL show the same section, and
no Land button, because its actions hold no `land`. A change document
without a `land` SHALL render exactly as before this requirement.

#### Scenario: Ready to land
- **WHEN** the change view renders an archived change whose `land` says the default branch has 3 new commits
- **THEN** it shows the gates, diff, spec changes and disclosures, and says landing will merge the 3 commits and run verify again

#### Scenario: Landed record
- **WHEN** the change view renders a document whose `land.landed` is true
- **THEN** the section's headline is `Landed` and the other parts still show

#### Scenario: Land section before the actions
- **WHEN** the change view renders a document with a `land` and an action client
- **THEN** the `Land` heading comes before the actions panel and the task table

#### Scenario: Document without land unchanged
- **WHEN** the change view renders a document whose `land` is null or missing
- **THEN** the markup equals the markup it rendered before this requirement

### Requirement: Approve notices document
A `WebReview` SHALL carry `notices`, the `ApprovalNotices` that
`buildApprovalNotices` derives for the change and its review digest.
`getWebChange` SHALL always set it on a review; the type declares it optional
so documents built before it stay valid.

#### Scenario: Review with notices
- **WHEN** an unapproved change's delta removes a requirement
- **THEN** `review.notices` equals `buildApprovalNotices` for the folder and holds the `removed_requirement` notice

### Requirement: Notice block view
For a review with `notices`, the change view SHALL show a `Notices` section
after the header and before the brief. When `unusual` is false, it SHALL first
read `Nothing unusual`. Each of the first `maxShown` notices SHALL be an item
that opens to its detail; its summary names the severity in a word (`Red`,
`Amber` or `Grey`) and the label, and the item's severity class draws a
coloured stripe from the dashboard's status tokens, so severity reads by word,
stripe and colour in both themes. The other notices SHALL sit inside one item
summarised `<k> more`. The section's text SHALL wrap at phone width without
horizontal page scroll.

While a red notice has not been opened in the view, the Approve button SHALL
be disabled, with `Open each red notice to approve: <label>, <label>` beside
it. An Approve tap SHALL post `opened`, the ids of the notices opened so far,
sorted. A review without `notices` SHALL render and post exactly as before
this requirement.

#### Scenario: Nothing unusual
- **WHEN** a review's notices hold only a grey notice
- **THEN** the `Notices` section reads `Nothing unusual` and shows the grey notice with the word `Grey`

#### Scenario: Folded notices
- **WHEN** a review holds seven notices with `maxShown` 5
- **THEN** five items show and a sixth item summarised `2 more` holds the other two

#### Scenario: Red notice gates Approve
- **WHEN** the actions hold `approve` and the review's red notice `removed_requirement` has not been opened
- **THEN** the Approve button is disabled and names `removes requirements`, and once it is opened the button is enabled and a tap posts `{"verb":"approve","opened":["removed_requirement"]}`

#### Scenario: Notices at phone width
- **WHEN** the notice block is viewed at a narrow width
- **THEN** its text wraps and nothing scrolls the page sideways

### Requirement: Project paths on a server
`startWebServer` SHALL take an optional `site`, a `WebServerSite` from
`src/core/web/web-site.ts` holding the server's `name` and `project`. Without
a `site` the server SHALL behave exactly as "Loopback HTTP transport" and
"Loopback write actions" say, and SHALL answer no `/p/` path and no
`/api/server`.

With a `site`, every path the server answers SHALL sit under
`/p/<project>/`: a request for `/p/<project>/<rest>` SHALL be handled exactly
as a server without a `site` handles `/<rest>`, the actions guard, the token
and the method rules included, and `/p/<project>/` SHALL serve the
dashboard's `index.html`. `GET` and `HEAD` of `/` and of `/p/<project>` SHALL
return 302 with `Location: /p/<project>/`. Any other path SHALL return 404
with `{"error":"not found"}`. The handle's `url` SHALL be
`http://127.0.0.1:<port>/p/<project>/`.

`GET /p/<project>/api/server` SHALL return the `WebServerStatus` from
`readServerStatus(projectRoot, site, home)`: the site's `name` and `project`,
`path` `/p/<project>/`, and the project's `service` and `watcher` records and
`log` path as `readWatchState` reads them at the time of the request, with
`Cache-Control: no-store`.

#### Scenario: Paths with a site
- **WHEN** a server started with site `{ name: 'box', project: 'osq' }` receives each GET below
- **THEN** it answers as the table says:

| Path | Status | Body or header |
|---|---|---|
| `/` | 302 | `Location: /p/osq/` |
| `/p/osq` | 302 | `Location: /p/osq/` |
| `/p/osq/` | 200 | the dashboard's `index.html` |
| `/p/osq/api/report` | 200 | the report document |
| `/p/osq/api/server` | 200 | the status document |
| `/api/report` | 404 | `{"error":"not found"}` |
| `/p/other/api/report` | 404 | `{"error":"not found"}` |

#### Scenario: Write through the project path
- **WHEN** a server with a site and a `runAction` receives a valid POST to `/p/osq/api/actions/001` with the token, an allowed host and origin
- **THEN** `runAction` receives the request for change `001`, and the same POST to `/api/actions/001` returns 404 without calling it

#### Scenario: Status document
- **WHEN** the project's `service.json` and `watcher.json` name live pids and the watcher record's `waiting` is `osq build is stale`
- **THEN** `/p/osq/api/server` returns `name` `box`, `project` `osq`, `path` `/p/osq/`, the service's pid, and the watcher's mode, version, commit and `waiting`

#### Scenario: No site, no project paths
- **WHEN** a server started without a site receives `GET /api/server` and `GET /p/osq/api/report`
- **THEN** both return 404 and the server's `url` has no `/p/` path

### Requirement: Server header and service panel
The dashboard SHALL resolve its API base from the page's path: under
`/p/<project>/` the data module, the actions client and the event source
SHALL request paths under `/p/<project>/api/`; anywhere else they SHALL
request `/api/` paths exactly as before. Only under `/p/<project>/` SHALL the
dashboard request `api/server`, once when it starts and again on every
refresh and every `changed` event; a failed request SHALL leave the last
status shown.

With a status, the header SHALL show `<project> on <name>` next to the title,
and the home view SHALL open with a Service panel before its groups. The
panel SHALL say:

- `Watcher: running in the background` or `Watcher: running in a terminal`, by the watcher record's `mode`, with its `version`, `commit` and `startedAt`; or `Watcher: not running` when there is no watcher record;
- `Waiting: <reason>` as a warning when the watcher's `waiting` is not null;
- `Service log: <log>` when there is a service record.

Without a status, as under `osq serve` and in a static export, the header and
the home view SHALL render as before. The header and panel SHALL fit a
360-pixel-wide screen without horizontal scrolling.

#### Scenario: Header on a server
- **WHEN** the dashboard is opened at `/p/osq/` and `api/server` returns name `box` and project `osq`
- **THEN** the header shows `osq on box`

#### Scenario: Service panel states
- **WHEN** the home view renders with each status below
- **THEN** the Service panel shows the lines in the table:

| Watcher record | Service record | Lines |
|---|---|---|
| mode `background`, waiting null | present, log `/h/.osq/watch/x/watch.log` | `Watcher: running in the background`, `Service log: /h/.osq/watch/x/watch.log` |
| mode `terminal`, waiting null | none | `Watcher: running in a terminal` |
| mode `background`, waiting `osq build is stale` | present | `Watcher: running in the background`, `Waiting: osq build is stale`, `Service log: ...` |
| none | none | `Watcher: not running` |

#### Scenario: Loopback dashboard unchanged
- **WHEN** the dashboard is opened at `/` and has no status
- **THEN** it requests no `api/server`, its requests use `/api/` paths, and the header and home view render as before
