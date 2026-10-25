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
Running items SHALL show their task and elapsed time. A paused running item
SHALL show its task and `paused until <YYYY-MM-DD HH:MM> UTC` from its
`pausedUntil` instead of an elapsed time. Landed items SHALL show
their archive time and SHALL be labelled as landed since the last `osq` look.
Each empty group SHALL say so in one line.

#### Scenario: Needs you
- **WHEN** the inbox holds a dead task
- **THEN** home shows it under Needs you with its `osq retry <id> <n>` command

#### Scenario: Quiet repository
- **WHEN** all three groups are empty
- **THEN** home shows one empty-state line per group and no error

#### Scenario: Paused task on home
- **WHEN** the inbox's running group holds a paused item for task 2 of change `007` with `pausedUntil` `2099-01-01T09:30:00.000Z`
- **THEN** home shows it under Running with `paused until 2099-01-01 09:30 UTC`, a link to change `007`, and no `elapsed` text

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
as it labels the other kinds, `change-archived` items `not landed`,
`after-land-failed` items `after-land failed`, and `validator-failing` items
`validator failing`. It
SHALL have no label for a verification kind, because the inbox has none.

#### Scenario: Planning label
- **WHEN** `needsYouKindLabel('planning')` is called
- **THEN** it returns `needs planning`

#### Scenario: Not landed label
- **WHEN** `needsYouKindLabel('change-archived')` is called
- **THEN** it returns `not landed`

#### Scenario: After-land failed label
- **WHEN** `needsYouKindLabel('after-land-failed')` is called
- **THEN** it returns `after-land failed`

#### Scenario: Validator failing label
- **WHEN** `needsYouKindLabel('validator-failing')` is called
- **THEN** it returns `validator failing`

### Requirement: Invalidation across worktrees
`osq serve` SHALL resolve the change trees through `changeTrees`, and the
tree record path through `treeRecordPath`, when it starts, and pass both to
the invalidation hub through `createTreeHub` in
`src/core/web/web-tree-hub.ts`. The hub SHALL watch the configured OpenSpec
root of the first tree, the change folder of each worktree tree, and, when
`recordPath` is given, the tree record. A notification inside a worktree
tree's change folder SHALL invalidate that change's numeric id. A
notification on the tree record SHALL be a global invalidation. Without
resolved trees, the hub SHALL watch the project root's OpenSpec root as
before.

After each batch it sends, and every `inbox.pollSeconds`, the server SHALL
resolve the trees again. When their `treeWatchPaths` differ from the watched
paths, it SHALL open a hub over the new trees and the same record path, close
the old hub, and send connected clients one changed event with an empty id
list. Clients SHALL stay connected across the swap. Resolutions SHALL run
one at a time, and a failed resolution SHALL keep the current hub. Server
shutdown SHALL cancel the poll timer along with the rest. `startWebServer`
SHALL take a `trees` seam, defaulting to `changeTrees`, and an `every` seam,
defaulting to `setInterval`, beside `watch` and `schedule`.

#### Scenario: Edit in a worktree folder
- **WHEN** a file inside a worktree tree's change folder `001-a` changes
- **THEN** connected clients receive one changed event with ids `[1]`

#### Scenario: Server wiring
- **WHEN** `startWebServer` starts with `vcs.enabled` and one osq worktree
- **THEN** the hub's watcher is given the OpenSpec root and that worktree's change folder

#### Scenario: Tree record in the server's watch
- **WHEN** `startWebServer` starts with `vcs.enabled` on a temporary repository's checkout
- **THEN** the hub's watcher is given `<checkout>/.git/osq-trees.jsonl` among its paths

#### Scenario: Tree record change
- **WHEN** the tree record changes while the trees stay the same
- **THEN** connected clients receive one changed event with ids `[]` and the watcher is not replaced

#### Scenario: New worktree while serving
- **WHEN** the `trees` seam returns a second worktree tree after the first batch
- **THEN** a second watcher opens over the new paths, the first watcher closes, and connected clients receive a changed event with ids `[]` after the batch's own event

#### Scenario: Poll finds a new worktree
- **WHEN** the `trees` seam returns a second worktree tree and the manual poll timer fires with no watcher event
- **THEN** a second watcher opens over the new paths and connected clients receive one changed event with ids `[]`

#### Scenario: Server closes the poll
- **WHEN** the server closes
- **THEN** the poll timer is cancelled and the current watcher is closed

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
step's command. Repeated commands SHALL appear once. When
`canStartPlanner(next, location, config)` is true for the change's next step
and location, the actions SHALL end with one `plan` action whose command is
`osq plan <id> --run` and whose target is null.

`POST /api/actions/<id>` SHALL be refused with 403 and
`{"error":"write request refused"}`, before its body is read and before any
state changes, unless the host is allowed, the `Origin` header is present and
allowed, the `Content-Type` media type is `application/json`, and the
`X-Osq-Token` header equals the server's token under a constant-time compare.
A selector that fails decoding SHALL then return 400. While another action
runs on the same server, the request SHALL return 409 with
`{"error":"another action is running"}` and SHALL not be queued. The body
SHALL be a JSON object with `verb` one of `approve`, `land`, `reject`,
`retry`, or `plan`, a non-empty string `reason` for `reject`, and a non-empty
string `target` for `retry`; an `approve` body MAY carry `opened`, a list of
strings, and a `plan` body MAY carry `notes`, a non-empty string. Any other
body SHALL return 400 with an error naming what is wrong, and no action runs;
an unknown verb's error SHALL be `verb must be approve, land, reject, retry,
or plan`. A valid request SHALL call `runAction` once with the verb, the
decoded selector as `change`, the reason or target, for `approve` the
`opened` list only when the body carries one, and for `plan` the `notes` only
when the body carries them, and SHALL return 200 with the
`WebActionResult` it resolves to, whatever its exit code. When `runAction`
rejects, the server SHALL return 500.
The running action SHALL end, by result or failure, before the next one can
start. A `plan` action ends once the planner process has started, so it holds
the one-action slot only that long.

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

#### Scenario: Plan action offered
- **WHEN** with `vcs.enabled` on, a client requests the actions of an unapproved change 001 that has a brief and the planning sentinel verify
- **THEN** the actions are exactly one `plan` action with command `osq plan 001 --run` and target null, and `manual` is `osq plan 001`

#### Scenario: Plan action bodies
- **WHEN** a valid POST to `/api/actions/001` carries each body below
- **THEN** the result is the one below:

| Body | Result |
|---|---|
| `{"verb":"plan"}` | `runAction` receives `plan` for change `001` with no `notes` |
| `{"verb":"plan","notes":"use the cache"}` | `runAction` receives `plan` for change `001` with `notes` `use the cache` |
| `{"verb":"plan","notes":""}` | 400, `runAction` not called |
| `{"verb":"plan","notes":3}` | 400, `runAction` not called |
| `{"verb":"merge"}` | 400 with error `verb must be approve, land, reject, retry, or plan` |

#### Scenario: Server runs the plan command
- **WHEN** the server's action runner, `osq serve`'s default table or the server worker's `createServerCommands`, runs a `plan` request for change `001` with notes `use the cache`
- **THEN** it calls `planCommand` with `001`, `run` true and notes `use the cache`, with the request's inputs

### Requirement: Change actions
The change view SHALL show, when the dashboard is served by `osq serve` and
not a static export, the actions of the change's `WebActions` where they
apply. When the page's `main` is `approve` and the actions hold `approve`,
the button bar SHALL show an `Approve` button; when `main` is `land` and the
actions hold `land`, a `Land` button. Each is a `button` with class
`action-button` inside a `div` with class `action-item`, which for Approve
also holds the red-notice note and the review's flags. When the actions hold
no `approve`, the flags SHALL show above the button bar.

The head SHALL hold a `More actions` menu, a `<details class="page-menu">`
whose summary has `aria-label="More actions"`, when the actions hold
`reject`, a `retry` with target `change`, or a `manual` command. It SHALL
show `Reject` with a reason text field that must be non-empty, `Retry
change`, and each `manual` command as code to run in a shell. A `retry` with
a task target SHALL show as a `Retry task <n>` button in that task's row of
the task table.

A tap SHALL post one request with the document's token, disable every action
button until it answers, then show the exit code, the captured stdout and
stderr, and on failure the error message and its `Next:` step, and load the
actions again. A 409 answer SHALL show that another action is running. The
actions SHALL load again whenever a fresh change document arrives. A static
export SHALL make no actions request and show no action button.

`createActionClient(fetch)` in `packages/ui/src/change/actions-client.ts`
SHALL load `GET /api/actions/<id>`, giving null on 404, and post a
`WebActionRequest` without `change` as JSON with `Content-Type:
application/json` and `X-Osq-Token`.

#### Scenario: Approval buttons
- **WHEN** the change page renders a `ready-for-approval` change with actions holding `approve` and a `manual` `osq plan 001`
- **THEN** the button bar shows an `Approve` action button, the `More actions` menu shows the text `osq plan 001`, and no other action button shows

#### Scenario: Result after a tap
- **WHEN** a tap answers with exit code 1, an error message, and next step `osq retry 001 2`
- **THEN** the view shows the exit code, the message, and `Next: osq retry 001 2`

#### Scenario: Static export has no buttons
- **WHEN** the change view renders without an action client
- **THEN** it shows no action button and makes no actions request

#### Scenario: Reject in the menu
- **WHEN** the change page renders actions holding `approve`, `reject` and `retry` with target `2`, and task 2 is in the task table
- **THEN** `Reject` and its reason field are inside the `More actions` menu, `Retry task 2` is inside task 2's row, and the button bar holds only `Approve`

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

### Requirement: Forwarded command endpoint
`startWebServer` SHALL take an optional `runCommand`, a
`ForwardedCommandRunner` from `src/core/web/web-remote.ts`, and SHALL serve
the paths below only when it has both a `site` and a `runCommand`. A server
without either SHALL answer `/api/commands` and every `/api/files/` path
exactly as it does today, so `osq serve` does not change. The paths sit under
`/p/<project>/` like every other path of a site.

The command paths SHALL have their own token, 32 random bytes from
`createActionToken`, created when the server starts. Host and origin are
judged as "Loopback write actions" judges them.

`GET api/commands` SHALL return 403 with `{"error":"request refused"}` when
the host is not allowed or an `Origin` header is present and not allowed, and
otherwise 200 with `{"token":"<token>"}`.

`POST api/commands` SHALL be refused with 403 and
`{"error":"write request refused"}`, before its body is read, unless the host
is allowed, the `Origin` header is present and allowed, the `Content-Type`
media type is `application/json`, and `X-Osq-Token` equals the command token
under a constant-time compare. The body SHALL be a JSON object with a string
`command`, an array `args` and an object `options`; any other body SHALL
return 400 with an error naming what is wrong, and no command runs. A valid
request SHALL call `runCommand` once with `{ command, args, options }` and an
`emit` function, answer 200 with `Content-Type: application/x-ndjson` and
`Cache-Control: no-store`, write each emitted `{ stream, text }` as one JSON
line when it is emitted, and end with one line `{ exitCode, error, next }`
holding what `runCommand` resolves. When `runCommand` rejects, the last line
SHALL be `{"exitCode":1,"error":"Error: <message>","next":null}`. Command
requests SHALL not wait for or take the write actions' slot; the runner
orders them.

#### Scenario: Forwarded command streams its output
- **WHEN** a valid `POST /p/osq/api/commands` with body `{"command":"status","args":[],"options":{}}` reaches a runner that emits stdout `a\n`, then stderr `b\n`, and resolves exit code 2, error `x` and next `osq y`
- **THEN** the runner receives that command, args and options, and the response is 200 with exactly the lines `{"stream":"stdout","text":"a\n"}`, `{"stream":"stderr","text":"b\n"}` and `{"exitCode":2,"error":"x","next":"osq y"}`

#### Scenario: Command without proof
- **WHEN** a `POST /p/osq/api/commands` lacks the token, carries a wrong token, lacks `Origin`, carries another site's `Origin`, or is not `application/json`
- **THEN** the server returns 403 with `{"error":"write request refused"}` and does not call the runner

#### Scenario: Bad command body
- **WHEN** a valid `POST /p/osq/api/commands` carries invalid JSON, no `command`, or `args` that is not an array
- **THEN** the server returns 400 and does not call the runner

#### Scenario: Command token
- **WHEN** a client with an allowed host requests `GET /p/osq/api/commands`, and another request carries `Host: evil.example`
- **THEN** the first gets 200 with a 64-character hex `token` that the actions document does not carry, and the second gets 403 with no token

#### Scenario: No runner, no command paths
- **WHEN** a server started with a site and no `runCommand` receives `GET /p/osq/api/commands`, and a server started without a site receives `GET /api/commands`
- **THEN** both return 404 with `{"error":"not found"}`

### Requirement: Change folder files on a server
With a `site` and a `runCommand`, `startWebServer` SHALL serve a change
folder's files under `/p/<project>/api/files/<id>`, through
`src/core/web/web-remote-files.ts`. The change SHALL be resolved with
`findChange` from the change locations module, and SHALL be an active change
in the project's own tree, the first tree `changeTrees` returns, with no
`.run/approved`. A file path is relative to the change folder and
`/`-separated, and its content is UTF-8 text.

`GET api/files/<id>` SHALL use the read guard of `GET api/commands` and
return 200 with `{ folder, files }`: the folder's name, and an object mapping
the path of every file in the folder, except those under `.run/`, to its
text, in sorted path order.

`PUT api/files/<id>` SHALL use the write guard and token of `POST
api/commands`, read a body `{ "files": { "<path>": "<text>" } }`, and replace
the folder's files: afterwards the folder SHALL hold exactly the uploaded
files plus its `.run/` folder unchanged, with no empty folder left behind. It
SHALL return 200 with `{ folder, files }`, `files` being the number of files
written. One upload SHALL run at a time. A refused upload SHALL change no
file and return the status and `{"error":"<error>"}` in the table:

| Case | Status | Error |
|---|---|---|
| A path that is empty, absolute, holds `\` or a NUL, has an empty, `.` or `..` segment, or whose first segment is `.run` | 400 | `path outside the change folder: <path>` |
| A body that is not a JSON object whose `files` maps strings to strings | 400 | `body must be {"files": {"<path>": "<text>"}}` |
| No active change matches `<id>` | 404 | `change <id> not found` |
| The change lives in another tree or has `.run/approved` | 409 | `change <folder> is approved; only an unapproved change's files move` |
| Another upload is running | 409 | `another upload is running` |

`GET api/files/<id>` SHALL answer the 404 and 409 rows the same way. The
selector SHALL be decoded with `decodeChangeSelector`, and an unsafe one SHALL
return 400 with `{"error":"unsafe change selector"}`.

#### Scenario: Download a change folder
- **WHEN** change `001-demo` holds `proposal.md`, `tasks/1.md` and `.run/manifest.json`, and a client requests `GET /p/osq/api/files/001`
- **THEN** the response is 200 with `folder` `001-demo` and `files` holding exactly `proposal.md` and `tasks/1.md` with their text

#### Scenario: Upload replaces the folder
- **WHEN** change `001-demo` holds `proposal.md`, `tasks/1.md` and `.run/manifest.json`, and a valid `PUT /p/osq/api/files/001` uploads `proposal.md` with new text and `tasks/2.md`
- **THEN** the response is 200 with `files` 2, and the folder holds the new `proposal.md`, `tasks/2.md` and the unchanged `.run/manifest.json`, and no `tasks/1.md`

#### Scenario: Upload refused outside the change folder
- **WHEN** a valid `PUT /p/osq/api/files/001` uploads `proposal.md` and one path below
- **THEN** the response is 400 with the error in the table, and no file in the project changes:

| Path | Error |
|---|---|
| `../x.md` | `path outside the change folder: ../x.md` |
| `/etc/x.md` | `path outside the change folder: /etc/x.md` |
| `.run/approved` | `path outside the change folder: .run/approved` |
| `tasks/../../x.md` | `path outside the change folder: tasks/../../x.md` |
| `tasks//1.md` | `path outside the change folder: tasks//1.md` |
| `a\b.md` | `path outside the change folder: a\b.md` |

#### Scenario: Approved change refused
- **WHEN** change `001-demo` has `.run/approved` and a valid `PUT /p/osq/api/files/001` arrives
- **THEN** the response is 409 with `{"error":"change 001-demo is approved; only an unapproved change's files move"}` and no file changes

#### Scenario: Upload without proof
- **WHEN** a `PUT /p/osq/api/files/001` lacks the token
- **THEN** the response is 403 with `{"error":"write request refused"}` and no file changes

### Requirement: Runs after in the change view
The web document's change SHALL carry `runsAfter`, what "Runs after in show"
gives for an active change, built with the server's project root, and leave
it out when that list is empty or the change is archived or rejected. The
change view's header SHALL then show a `Runs after` row whose value lists
each entry as `osq show` prints it, `<folder> (depends_on)`,
`<folder> (also writes <capabilities joined with ", ">)`, or
`<folder> (also writes <capabilities joined with ", ">; approved again since)`
for an entry with `reapproved`, joined with `, `.
With no `runsAfter`, the header SHALL show no such row. The row SHALL show
for an unapproved change on the approve view and for an approved, waiting
change alike.

#### Scenario: Change view names what it runs after
- **WHEN** the change view renders a change whose `runsAfter` is `[{ folder: '001-a', capabilities: ['orders'] }, { folder: '000-z', capabilities: null }]`
- **THEN** its header has a `Runs after` row reading `001-a (also writes orders), 000-z (depends_on)`

#### Scenario: No row without a wait
- **WHEN** the change view renders a change with no `runsAfter`
- **THEN** its header has no `Runs after` row

#### Scenario: Web document carries the wait
- **WHEN** the web document is built for a temporary repository where `001-a`, which writes `orders`, is approved into a worktree and the draft `002-b` also writes `orders`
- **THEN** `002-b`'s change has `runsAfter` `[{ folder: '001-a', capabilities: ['orders'] }]`, and `001-a`'s change has no `runsAfter` key

#### Scenario: Change view names a re-approved overlap
- **WHEN** the change view renders a change whose `runsAfter` is `[{ folder: '001-a', capabilities: ['orders'], reapproved: true }]`
- **THEN** its header has a `Runs after` row reading `001-a (also writes orders; approved again since)`

### Requirement: Docs document
`GET /api/docs` SHALL return the docs site `buildDocsSite(projectRoot,
config)` builds, as JSON, through the same read-only document table as
`/api/report`, `/api/graph`, `/api/system` and `/api/inbox`, and under
`/p/<project>/api/docs` on a server. `startWebServer` SHALL take an optional
`getDocs` like the other documents. The dashboard data layer SHALL load it for
the docs routes, `#/docs`, `#/docs/capabilities/<name>` and
`#/docs/adrs/<number>`, hold it as the snapshot's `docs`, and fetch it again
on a `changed` event while a docs route is open. A route name or number SHALL
be decoded like a change folder key, and an unusable one SHALL resolve to the
home route.

#### Scenario: Docs over HTTP
- **WHEN** the server runs over the docs fixture and `/api/docs` is requested
- **THEN** it answers 200 with the site whose `capabilities` are `invoices` and `pricing` and whose `adrs` are `001` to `004`

#### Scenario: Docs routes
- **WHEN** the hashes below are parsed
- **THEN** they resolve as below, and each route renders back to its hash:

| Hash | Route |
|---|---|
| `#/docs` | `docs` |
| `#/docs/capabilities/pricing` | `docs-capability` with name `pricing` |
| `#/docs/adrs/004` | `docs-adr` with number `004` |
| `#/docs/capabilities/a%2Fb` | home |

### Requirement: Docs view
The dashboard SHALL add a `Docs` link to its navigation, after `Graph`. On
`#/docs` it SHALL list the groups of the docs site in order, each a heading
with a link per capability and its purpose, then the ADRs, each a link with
its number, title and status. A capability route SHALL show the capability
page's group, purpose, requirements with their `shall` sentences and scenario
names, decisions with their rules and ADR links, Code ownership globs, the
code map when it is not null, and recent changes with their date and goal,
each change linking to its change view. An ADR route SHALL show its status,
a link to its successor when superseded, links to the capabilities it applies
to, its rule, and its body as preformatted text. A name or number the site
lacks SHALL show `No such page.` The view SHALL add no package, and at phone
width its text SHALL wrap instead of scrolling sideways.

#### Scenario: Docs index view
- **WHEN** the dashboard renders `#/docs` with the docs fixture's site
- **THEN** it shows the `billing` group before `ungrouped`, a link to `#/docs/capabilities/pricing`, and ADR 003 marked `superseded`

#### Scenario: Capability and ADR views
- **WHEN** the dashboard renders `#/docs/capabilities/pricing`, then `#/docs/adrs/003`, then `#/docs/adrs/999` with the docs fixture's site
- **THEN** the first shows `The engine SHALL price every unit in a quote at the tier its quantity falls in.`, `src/pricing/quote.ts:33` and a link to change `007`, the second shows a link to `#/docs/adrs/004`, and the third shows `No such page.`

### Requirement: Change next step in the web document
`getWebChange` SHALL set `nextStep`, `planHandoff` and `autoSteer` on every
change document it builds, read by `readWebChangeNext(projectRoot,
folderPath, location, config)` in `src/core/web/web-data-next.ts`:

- `nextStep` SHALL be what `readNextStep(projectRoot, folderPath, config)`
  returns for the change's folder, the function `osq inbox` uses. It SHALL be
  null for a rejected change and when `readNextStep` throws.
- `planHandoff` SHALL be `{ text, promptReady }`, where `text` is
  `formatPlanPasteBlock(folderPath)` and `promptReady` is true exactly when
  the folder holds `plan-prompt.md`. It SHALL be null for a rejected change.
- `autoSteer` SHALL be `{ outcome, changed }` from the record
  `currentAutoSteer` returns for an active change's derived state, and null
  when it returns none or the change is archived or rejected.

The three fields SHALL be optional on `WebChange`, so documents built before
them stay valid, and a missing field reads as null. The browser chooses the
page from these fields and never reads a marker or derives a next step.

#### Scenario: Change documents carry the next step
- **WHEN** `getWebChange` builds the document for each change below in a project without version control
- **THEN** its fields are:

| Change | `nextStep` | `planHandoff` | `autoSteer` |
|---|---|---|---|
| active `001-demo` with `brief.md` and the planning sentinel verify | `{ state: 'unplanned', command: 'osq plan 001', detail: null }` | `text` is `formatPlanPasteBlock(<folder>)`, `promptReady` false | null |
| the same change after `plan-prompt.md` is written in its folder | `{ state: 'unplanned', command: 'osq plan 001', detail: null }` | `promptReady` true | null |
| approved `001-order-flow` whose task 2 is blocked and whose current automatic steering record says `ready` with `changed: ['tasks/2.md']` | `{ state: 'dead', command: 'osq approve 001', detail: 'revised plan ready' }` | `text` is `formatPlanPasteBlock(<folder>)` | `{ outcome: 'ready', changed: ['tasks/2.md'] }` |
| an archived change | `{ state: 'landed', command: null, detail: null }` | `text` is `formatPlanPasteBlock(<folder>)` | null |
| a rejected change | null | null | null |

### Requirement: Change page model
`packages/ui/src/change/page-model.ts` SHALL export pure functions that turn
a `WebChange` into what the change page shows, reading only the document and
the arguments they name.

`changePage(change)` SHALL return `{ state, label, summary, main, second }`.
`state` SHALL be `rejected` when the location is `rejected`; else `unknown`
when `nextStep` is missing or null; else `revised` when `nextStep.state` is
`dead` and `autoSteer.outcome` is `ready`; else `nextStep.state`. Below,
`<n>` is the number of tasks, `<k>` the number whose state is `done`, and
the noun after a count is `task` when `<n>` is 1 and `tasks` otherwise:

| `state` | `label` | `summary` | `main` | `second` |
|---|---|---|---|---|
| `unplanned` | `Needs a plan` | `Not planned yet` | `copy` | null |
| `planning` | `Planning` | `Planner running` | null | null |
| `ready-for-approval` | `Waiting for you` | `<n> tasks · planned by <planner>`, or `<n> tasks` when the planner is null | `approve` | `plan-again` |
| `running` | `Running` | `<k> of <n> tasks done` | null | null |
| `blocked` | `Blocked` | `<k> of <n> tasks done` | null | null |
| `dead` | `Halted` | `<k> of <n> tasks done` | `plan-it` | null |
| `revised` | `Waiting for you` | `Halted · revised by the automatic planner` | `approve` | `plan-it-myself` |
| `archived` | `Ready to land` | `<n> tasks done · archived` | `land` | `plan-again` |
| `landed` | `Landed` | `<n> tasks done · landed` | null | null |
| `rejected` | `Rejected` | `<n> tasks` | null | null |
| `unknown` | `Change` | `<k> of <n> tasks done` | null | null |

`progressLine(change)` SHALL return `Task <number> of <n> running ·
<elapsed>` for the first task whose state is `running`, where `<elapsed>`
is `<s>s` under 60 seconds, `<m> min` with the whole minutes from 60
seconds, and `unavailable` when `runningElapsedSeconds` is null; with no
running task it SHALL return `<k> of <n> tasks done`.

`planningLine(change, now)` SHALL return `Planning on server · <elapsed>`,
with `<elapsed>` formatted as in `progressLine` from the whole seconds
between `planRun.startedAt` and `now`, a time in milliseconds, and never less
than 0; `<elapsed>` SHALL be `unavailable` when `planRun` or its `startedAt`
is missing or null.

`planRunLine(change)` SHALL return null unless `planRun` is set, and then by
its outcome: `The last planner run changed nothing.` for `unchanged`, `The
last planner run left the plan failing osq lint.` for `lint_red`, `The last
planner run timed out.` for `timed_out`, `The last planner run failed:
<line>` for `failed` with `<line>` the first line of `detail`, or `The last
planner run failed.` when `detail` is null, and null for `running` and
`ready`.

`haltFacts(change)` SHALL return `{ heading, reason, touched }` for the first
task whose state is `dead` or `regressed`: `Task <number> stopped: <title>`,
its `reason` or `unavailable`, and the paths of the last line of its result
that starts with `Touched: `, split on `, `, or none. With no such task it
SHALL return `The change stopped`, `nextStep.detail` or `unavailable`, and
no paths.

`landLine(land)` SHALL return the first line that applies: `Halted:
<halt.message>` when `halt` is set; `Sync stopped: <lastSyncStop.message>`
when `lastSyncStop` is set; `<gate> failed` for the first gate whose outcome
is `failed`, with the gate named `Task <n>`, `Verify`, `Check` or
`Validator`; `No gates recorded` without gates; else `All <g> gates passed`,
with `gate` when `<g>` is 1.

`landedLine(change)` SHALL return `<n> tasks, <f> first try`, where `<f>`
counts the done tasks with exactly 1 attempt.

#### Scenario: Page per state
- **WHEN** `changePage` reads a document with three tasks, one of them done, planner `claude-opus-5-5`, and each next step below
- **THEN** it returns:

| Document | `state` | `label` | `summary` | `main` | `second` |
|---|---|---|---|---|---|
| `nextStep.state` `unplanned` | `unplanned` | `Needs a plan` | `Not planned yet` | `copy` | null |
| `nextStep.state` `ready-for-approval` | `ready-for-approval` | `Waiting for you` | `3 tasks · planned by claude-opus-5-5` | `approve` | `plan-again` |
| `nextStep.state` `running` | `running` | `Running` | `1 of 3 tasks done` | null | null |
| `nextStep.state` `blocked` | `blocked` | `Blocked` | `1 of 3 tasks done` | null | null |
| `nextStep.state` `dead`, `autoSteer` null | `dead` | `Halted` | `1 of 3 tasks done` | `plan-it` | null |
| `nextStep.state` `dead`, `autoSteer.outcome` `ready` | `revised` | `Waiting for you` | `Halted · revised by the automatic planner` | `approve` | `plan-it-myself` |
| `nextStep.state` `archived` | `archived` | `Ready to land` | `3 tasks done · archived` | `land` | `plan-again` |
| `nextStep.state` `landed` | `landed` | `Landed` | `3 tasks done · landed` | null | null |
| location `rejected`, `nextStep` null | `rejected` | `Rejected` | `3 tasks` | null | null |
| no `nextStep` field | `unknown` | `Change` | `1 of 3 tasks done` | null | null |

#### Scenario: Progress line
- **WHEN** `progressLine` reads a document with three tasks, one done, and the tasks below
- **THEN** it returns:

| Tasks | Line |
|---|---|
| task 2 `running` with `runningElapsedSeconds` 42 | `Task 2 of 3 running · 42s` |
| task 2 `running` with `runningElapsedSeconds` 750 | `Task 2 of 3 running · 12 min` |
| task 2 `running` with `runningElapsedSeconds` null | `Task 2 of 3 running · unavailable` |
| no running task | `1 of 3 tasks done` |

#### Scenario: Halt facts
- **WHEN** `haltFacts` reads a document whose task 4, `Inbox rows`, is `dead` with reason `verify_red` and a result ending in `Touched: src/core/status/inbox.ts, tests/inbox.test.ts`
- **THEN** it returns heading `Task 4 stopped: Inbox rows`, reason `verify_red`, and touched `src/core/status/inbox.ts` and `tests/inbox.test.ts`; and for a document with no dead or regressed task and `nextStep.detail` `needs steering`, heading `The change stopped`, reason `needs steering`, and no paths

#### Scenario: Land line
- **WHEN** `landLine` reads each land view below
- **THEN** it returns:

| Land view | Line |
|---|---|
| four gates, all `passed` | `All 4 gates passed` |
| one gate, `passed` | `All 1 gate passed` |
| task 2 gate `failed` | `Task 2 failed` |
| no gates | `No gates recorded` |
| `lastSyncStop` message `merge conflict in src/a.ts` | `Sync stopped: merge conflict in src/a.ts` |
| `halt` message `verify failed after sync` and `lastSyncStop` set | `Halted: verify failed after sync` |

#### Scenario: Landed line
- **WHEN** `landedLine` reads a document with four done tasks, three of them with 1 attempt and one with 2
- **THEN** it returns `4 tasks, 3 first try`

#### Scenario: Planning page
- **WHEN** `changePage` reads a document with three tasks whose `nextStep.state` is `planning`
- **THEN** it returns state `planning`, label `Planning`, summary `Planner running`, and null `main` and `second`

#### Scenario: Planning line
- **WHEN** `planningLine` reads a document whose `planRun.startedAt` is `2026-10-14T09:30:00.000Z` with each `now` below
- **THEN** it returns:

| `now` | Line |
|---|---|
| `2026-10-14T09:30:42.000Z` | `Planning on server · 42s` |
| `2026-10-14T09:42:30.000Z` | `Planning on server · 12 min` |
| `2026-10-14T09:29:00.000Z` | `Planning on server · 0s` |
| any, with `planRun` null | `Planning on server · unavailable` |

#### Scenario: Planner run line
- **WHEN** `planRunLine` reads each `planRun` below
- **THEN** it returns:

| `planRun` | Line |
|---|---|
| null | null |
| `running` | null |
| `ready` | null |
| `unchanged` | `The last planner run changed nothing.` |
| `lint_red` | `The last planner run left the plan failing osq lint.` |
| `timed_out` | `The last planner run timed out.` |
| `failed`, detail `exit 1\nmore` | `The last planner run failed: exit 1` |
| `failed`, detail null | `The last planner run failed.` |

### Requirement: Change page layout
The change view SHALL show one layout for every change, built from
`changePage` and the functions beside it, in this order:

1. The head: the label in `<p class="page-label">`, the title as the `h2`
   with id `change-view-title`, and the summary in `<p class="page-summary">`.
2. The error alert with its Retry button, as before this requirement.
3. The hand-off block, when a plan button opened it.
4. The top block in `<section class="page-block">`, by state: for
   `unplanned`, the hand-off block; for `ready-for-approval` and `unknown`,
   the `Notices` section when the review has notices; for `running`, the
   progress line, the running task's title, and `Nothing for you to do. The
   inbox shows it when it needs you.`; for `blocked`, the same with the next
   step's detail, its first letter in capitals, after the progress line; for
   `dead`, the halt heading, `Reason: <reason>`, and `Touched` with each path
   when there are any; for `revised`, `Revised plan ready`, `The automatic
   planner changed the plan, and it lints clean.`, and `Changed` with each
   path of `autoSteer.changed`; for `archived`, the land line and, when the
   land view has a diff, `<files> files changed, +<added> -<removed>`; for
   `landed`, `Landed` and the landed line; for `rejected`, `Rejected:
   <reason>`, or `Rejected` without a rejection.
5. The folds, each a `<details class="page-fold">` closed at first, in this
   order and each only when it has content: `Brief` with the brief panel,
   `Plan` with the review sections and deltas, `Land` with the land section,
   `Tasks · <k> of <n> done` with the task table, `Approval digest` with the
   digest, and `About this change` with the header's folder key, location,
   state, runs after, planner, derivation time and rejection.
6. The button bar, `<div class="page-buttons">`: the main button, then the
   second button. `plan-it`, `plan-again` and `plan-it-myself` SHALL be
   buttons with class `page-button` labelled `Plan it`, `Plan again` and
   `Plan it myself`, shown with or without an action client and only when
   the document has a `planHandoff`. `approve` and `land` SHALL follow
   "Change actions". `copy` is the hand-off block's own button.

The page SHALL work at 390 px wide with no horizontal page scroll: text in
the head, the blocks and the hand-off wraps, and the task table scrolls
inside its fold. Every button and every fold or menu summary SHALL be at
least 44 px tall. The same page SHALL serve wider screens.

#### Scenario: Page order
- **WHEN** the change view renders a `running` document with a review, a brief and two tasks
- **THEN** the label, the title, the summary, the top block, the folds `Brief`, `Plan`, `Tasks · 0 of 2 done`, `Approval digest` and `About this change`, and the button bar appear in that order, and every fold is closed

#### Scenario: Top block per state
- **WHEN** the change view renders a document in each state below
- **THEN** its top block holds:

| State | Top block holds |
|---|---|
| `unplanned` | `Hand it to your planning agent` and the `Copy hand-off` button |
| `ready-for-approval` with a review with notices | the `Notices` heading |
| `running`, task 2 of 3 running for 42 seconds | `Task 2 of 3 running · 42s` and `Nothing for you to do. The inbox shows it when it needs you.` |
| `blocked`, detail `waiting for 001-a` | `Waiting for 001-a` |
| `dead`, task 4 `Inbox rows` dead with reason `verify_red` | `Task 4 stopped: Inbox rows` and `Reason: verify_red` |
| `revised`, `autoSteer.changed` `['tasks/2.md']` | `Revised plan ready` and `tasks/2.md` |
| `archived`, four passed gates | `All 4 gates passed` |
| `landed`, two done tasks with 1 attempt | `Landed` and `2 tasks, 2 first try` |
| `rejected`, reason `superseded` | `Rejected: superseded` |

#### Scenario: Plan buttons without an action client
- **WHEN** the change view renders a `dead` document with a `planHandoff` and no action client
- **THEN** it shows a `Plan it` button with class `page-button` and no `action-button`

#### Scenario: Change page at phone width
- **WHEN** the change page's style sheet is read
- **THEN** `.page-button`, `.action-button`, `.page-fold > summary` and `.page-menu > summary` each have `min-height: 44px`, the hand-off and block text wraps with `overflow-wrap: anywhere`, and the task table's container scrolls with `overflow-x: auto`

### Requirement: Change page hand-off
The hand-off block SHALL be a `<section class="handoff">` holding the heading
`Hand it to your planning agent`, `Paste this into a new agent session.`,
the `planHandoff.text` in `<pre class="handoff-text">`, the line `This folder
has no plan-prompt.md yet; run osq plan for this change first.` only when
`promptReady` is false, and a `Copy hand-off` button with class
`page-button`. Without a `planHandoff` there SHALL be no hand-off block.

When the change's `WebActions` hold a `plan` action, the hand-off block SHALL
start with a `Start planning` button with class `page-button` and the line
`Runs the planner on the server, in its own tree, and brings the plan back
here.` A tap SHALL run that action as every other action runs, and the button
SHALL be disabled while an action is pending. Without a `plan` action, or in
a static export, there SHALL be no `Start planning` button. When
`planRunLine(change)` is not null, the hand-off block SHALL show it in
`<p class="handoff-outcome">` before the paste text.

A tap on `Copy hand-off` SHALL call `copyText(text, clipboard)` from
`packages/ui/src/change/HandoffBlock.tsx` with `navigator.clipboard`, which
resolves true after `writeText(text)` succeeds and false when the clipboard
is missing or `writeText` rejects. After true the button SHALL read
`Copied`; after false the block SHALL show `Copy failed; select the text
above.` A tap on `Plan it`, `Plan again` or `Plan it myself` SHALL show the
hand-off block for the same change, and a second tap SHALL hide it.

#### Scenario: Hand-off text
- **WHEN** the change view renders an `unplanned` document whose `planHandoff` is `{ text: 'You are the planner for osq change 001-demo.\n', promptReady: false }`
- **THEN** the hand-off block shows that text in `<pre class="handoff-text">`, the no-prompt line, and the `Copy hand-off` button

#### Scenario: Prompt ready
- **WHEN** the same document's `promptReady` is true
- **THEN** the hand-off block has no no-prompt line

#### Scenario: Copy outcome
- **WHEN** `copyText('block', clipboard)` runs with each clipboard below
- **THEN** it resolves:

| Clipboard | Result |
|---|---|
| `writeText` resolves, recording its argument | true, and `writeText` received `block` |
| `writeText` rejects | false |
| undefined | false |

#### Scenario: Start planning button
- **WHEN** the change view renders an `unplanned` document with an action client whose actions are one `plan` action, and `Start planning` is tapped
- **THEN** the hand-off block starts with `Start planning` and the line about the server, the client posted `{"verb":"plan"}` once, and the view shows the action's result

#### Scenario: Start planning after Plan it
- **WHEN** the change view renders a `dead` document with detail `needs steering`, actions holding `plan`, and `Plan it` is tapped
- **THEN** the opened hand-off block starts with `Start planning`

#### Scenario: No start without the action
- **WHEN** the change view renders the `unplanned` document without an action client, or with actions that hold no `plan`
- **THEN** there is no `Start planning` button and the hand-off block still shows `Copy hand-off`

#### Scenario: Last run outcome
- **WHEN** the change view renders an `unplanned` document whose `planRun` is `{ outcome: 'lint_red', startedAt: null, detail: '- tasks/1.md: bad' }`
- **THEN** the hand-off block shows `The last planner run left the plan failing osq lint.` in `<p class="handoff-outcome">`

### Requirement: Change documents carry the planner run
A change document SHALL carry `planRun`, a `WebPlanRun`
`{ outcome, startedAt, detail }`, or null. `readWebChangeNext` SHALL derive
it for an active change from `currentPlanRun(state)`: `outcome` and `detail`
as it returns them, and `startedAt` its `at` while the outcome is `running`,
else null. It SHALL be null when `currentPlanRun` returns null, for an
archived or rejected change, and when the state cannot be derived. On the
`WebChange` type the field SHALL be optional, so older documents still read.

#### Scenario: Running planner in the document
- **WHEN** the server builds the document of an unapproved change whose `.run/plan-run.md` holds a `running` record with `at` `2026-10-14T09:30:00.000Z` and the test's own pid
- **THEN** its `planRun` is `{ "outcome": "running", "startedAt": "2026-10-14T09:30:00.000Z", "detail": null }` and its `nextStep.state` is `planning`

#### Scenario: Finished planner in the document
- **WHEN** the record is a `lint_red` record with body `- tasks/1.md: verify is the planning sentinel` and its `hash` matches the folder
- **THEN** `planRun` is `{ "outcome": "lint_red", "startedAt": null, "detail": "- tasks/1.md: verify is the planning sentinel" }`

#### Scenario: No planner run
- **WHEN** the change folder has no `.run/plan-run.md` and no `.run/auto-steer.md`
- **THEN** `planRun` is null

### Requirement: Change page while planning
When the page's state is `planning`, the top block SHALL show
`<p class="page-planning">` with `planningLine(change, now)` and
`<p class="page-note">` with `The plan comes back here when it lints clean.`,
and no hand-off block and no plan button SHALL show. `ChangeView` SHALL pass
`now` as the time of its last render and render again every 30 seconds while
the state is `planning`, so the minutes move without a new document.

#### Scenario: Planning top block
- **WHEN** the change view renders a document whose `nextStep.state` is `planning` and whose `planRun.startedAt` is 750 seconds before `now`
- **THEN** it shows `Planning on server · 12 min` and `The plan comes back here when it lints clean.`, no `Copy hand-off` button, and no `Start planning`, `Plan it` or `Plan again` button

### Requirement: Dashboard writing decision
osq's decisions SHALL include ADR 020, `decisions/020-dashboard-writing.md`,
accepted for `web-inspection`, with the rule its scenario quotes, its checks
test as `checks`, and the state, data-fetching and router packages as
`denies`. `validateDecisions` SHALL report no error or warning, the decisions
index SHALL link it once, and AGENTS.md's rules block SHALL not change.

#### Scenario: Dashboard writing ADR is accepted
- **WHEN** osq's own decisions are read with `readDecisions` and `DEFAULT_CONFIG`
- **THEN** ADR 020 is listed and not ignored, with status `accepted`, `appliesTo` `["web-inspection"]`, the rule "The dashboard renders server documents; logic sits in pure model files, components only render, shared state uses React context, and no state library is added.", `checks` `["tests/dashboard-writing-adr.test.ts"]` and `denies` `["zustand", "redux", "@reduxjs/toolkit", "react-redux", "mobx", "mobx-react-lite", "jotai", "recoil", "valtio", "xstate", "@xstate/react", "@tanstack/react-query", "swr", "react-router", "react-router-dom"]`, `validateDecisions` reports no error and no warning, and `decisions/README.md` links `020-dashboard-writing.md` exactly once

#### Scenario: Rules block without ADR 020
- **WHEN** `renderRulesBlock` renders osq's own decisions
- **THEN** no line ends in `ADR 020` and `checkProjectRules` reports nothing

### Requirement: Dashboard screen sources
A screen folder, any folder directly under `packages/ui/src`, SHALL hold files
only. No file in a screen folder SHALL contain
`EventSource`, `addEventListener`, `setInterval`, `setTimeout`,
`AbortSignal.timeout`, `fetch(`, `dangerouslySetInnerHTML` or `markdown`
unless the test's exception list names that file and token. The list SHALL
hold only `change/ChangeView.tsx` with `AbortSignal.timeout`, and an entry
whose file is missing or lacks its token SHALL fail the check.

#### Scenario: The dashboard keeps to ADR 020
- **WHEN** the screen check runs over the repository's `packages/ui/src` and the manifest check over `packages/ui/package.json`
- **THEN** each reports nothing

#### Scenario: Screen file problems
- **WHEN** the check runs over a `src` folder holding exactly one file with this content, and over this exception list
- **THEN** it reports exactly this list

| file | content | exceptions | report |
| --- | --- | --- | --- |
| `home/Clock.tsx` | `setInterval(tick, 1000);` | none | `home/Clock.tsx must not contain setInterval` |
| `report/Load.ts` | `fetch('/x');` | none | `report/Load.ts must not contain fetch(` |
| `change/ChangeView.tsx` | `AbortSignal.timeout(1);` | `change/ChangeView.tsx` with `AbortSignal.timeout` | none |
| `change/ChangeView.tsx` | `export const x = 1;` | `change/ChangeView.tsx` with `AbortSignal.timeout` | `change/ChangeView.tsx: AbortSignal.timeout is on the exception list but no longer appears` |
| `home/View.tsx` | `export const x = 1;` | `change/ChangeView.tsx` with `AbortSignal.timeout` | `change/ChangeView.tsx: AbortSignal.timeout is on the exception list but no longer appears` |
| `home/parts/Row.tsx` | `export const x = 1;` | none | `home/parts is a folder inside a screen folder` |
| `data.ts` | `fetch('/x');` | none | none |

### Requirement: Dashboard UI manifest
`packages/ui/package.json` SHALL list no package ADR 020 denies under
`dependencies` or `devDependencies`.

#### Scenario: Denied package in the UI manifest
- **WHEN** the check runs over a UI manifest
- **THEN** it reports exactly this list

| manifest | report |
| --- | --- |
| `{"devDependencies":{"react":"19.3.0","zustand":"5.0.0"}}` | `zustand is denied by ADR 020` |
| `{"dependencies":{"swr":"2.0.0"}}` | `swr is denied by ADR 020` |
| `{"devDependencies":{"react":"19.3.0","vite":"8.3.0"}}` | none |

### Requirement: Autopilot stop on the home view
The home view SHALL label an `autopilot-stopped` item `autopilot stopped` and
show ` — <reason>` after its title. Its title SHALL link to the change page
when `autopilotStopped.change` is not null, and be plain text when it is
null. A pure model file decides the route and the reason; the component only
renders them.

#### Scenario: Autopilot stopped label
- **WHEN** the label of the needs-you kind `autopilot-stopped` is read
- **THEN** it is `autopilot stopped`

#### Scenario: Stop rows on the home view
- **WHEN** the home view renders an `autopilot-stopped` item with this `autopilotStopped`
- **THEN** the row is this

| change | reason | row |
| --- | --- | --- |
| `"003"` | `halted` | links `003: Orders` to the change page, then reads ` — halted` |
| null | `not_approved` | shows `orders: Orders are totalled` with no link, then reads ` — not_approved` |

### Requirement: Overlap approved again on the home view
The home view SHALL label an `overlap-reapproved` item
`overlap approved again`, through `needsYouKindLabel` in
`packages/ui/src/home/labels.ts`.

#### Scenario: Overlap approved again label
- **WHEN** `needsYouKindLabel('overlap-reapproved')` is called
- **THEN** it returns `overlap approved again`
