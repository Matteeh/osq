# web-inspection Specification

## Purpose

Provides a local read-only HTTP and browser projection of osq's filesystem
state for delivery reporting, capability history, and detailed change evidence.

## Requirements

### Requirement: Stable web inspection documents
<!-- source: src/core/web-data*.ts, src/core/report.ts, src/core/show.ts, src/core/inbox*.ts, src/core/scope.ts, tests/web-data.test.ts, tests/fixtures/web/** -->
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

### Requirement: Read-only HTTP transport
<!-- source: src/core/web-server*.ts, src/core/web-static.ts, src/cli/serve.ts, tests/serve.test.ts -->
One Node `http` server SHALL expose `GET /api/report`, `GET /api/graph`,
`GET /api/changes/<id>`, `GET /api/inbox`, `GET /api/events`, and production
static assets. Every ordinary API request SHALL recompute its document from
files and retain no cache after the response.

The report response SHALL be the exact `MetricsReport` from
`getMetricsReport`, without a wrapper or web-only field. The inbox response
SHALL read the existing last-look cursor and equal a contemporaneous first
`osq --json` projection for the same filesystem and clock, but the HTTP request
SHALL not advance the cursor. Graph and change responses SHALL use the stable
web documents. JSON APIs SHALL use UTF-8, deterministic serialization, and
`Cache-Control: no-store`; failures SHALL return JSON 4xx or 5xx responses
without terminating the server.

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

### Requirement: Server-sent invalidation
<!-- source: src/core/web-events.ts, src/core/web-server.ts, tests/serve-sse.test.ts -->
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
<!-- source: src/core/web-static.ts, packages/ui/**, ui/dist/**, tests/serve-static.test.ts -->
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
<!-- source: packages/ui/src/data.ts, packages/ui/src/contracts.ts, packages/ui/src/app.tsx, packages/ui/src/router.ts, tests/ui-data.test.tsx, tests/import-graph.test.ts -->
The React application SHALL have one data module that owns every report, graph,
inbox, change, and events access. When typed `window.__OSQ_DATA__` exists, the
module SHALL prefer its report, graph, inbox, and keyed change documents;
otherwise it SHALL use only same-origin `/api/*` fetches. UI components SHALL
receive documents and callbacks and SHALL NOT invoke fetch or construct an
EventSource.

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
<!-- source: packages/ui/src/report/**, tests/ui-report.test.tsx -->
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
<!-- source: packages/ui/src/graph/**, tests/ui-graph.test.tsx -->
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
<!-- source: packages/ui/src/change/**, tests/ui-change.test.tsx -->
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
<!-- source: packages/ui/package.json, packages/ui/tsconfig.json, packages/ui/vite.config.ts, package.json, pnpm-workspace.yaml, tests/ui-budget.test.ts, tests/line-budget.test.ts -->
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
<!-- source: src/core/web/web-data-observations.ts, tests/web-data-unreported.test.ts, tests/web-planning-cost.test.ts -->
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
<!-- source: packages/ui/src/format.ts, packages/ui/src/report/format.ts, packages/ui/src/graph/format.ts, packages/ui/src/change/format.ts, packages/ui/src/change/BriefPanel.tsx, packages/ui/src/report/RepositoryTotals.tsx, tests/ui-change.test.tsx, tests/ui-report.test.tsx -->
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
<!-- source: src/core/web/web-data-graph.ts, src/core/web/web-data-types.ts, tests/web-data-progress.test.ts -->
Each `WebGraph` change node SHALL carry `doneCount`, the number of its tasks
with a done marker, next to `taskCount`. The count SHALL come from the same
marker derivation as `osq status`.

#### Scenario: Partly done change
- **WHEN** an active change has three tasks and one done marker
- **THEN** its node has `taskCount` 3 and `doneCount` 1

### Requirement: Dashboard home
<!-- source: packages/ui/src/home/**, packages/ui/src/app.tsx, tests/ui-home.test.tsx -->
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
<!-- source: packages/ui/src/changes/**, packages/ui/src/app.tsx, tests/ui-changes.test.tsx -->
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
<!-- source: packages/ui/src/styles.css, packages/ui/src/status.tsx, packages/ui/src/change/TaskTable.tsx, packages/ui/src/home/**, tests/ui-status.test.tsx -->
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
<!-- source: src/core/web/web-export.ts, packages/ui/vite.config.ts, tests/web-export.test.ts -->
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
