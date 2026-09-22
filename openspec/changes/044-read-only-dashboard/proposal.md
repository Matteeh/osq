---
title: Read-only delivery dashboard
depends_on: ["043"]
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - metrics-and-reporting
    - spec-lint-and-approve
    - status-inspection
    - watcher-and-harness
---
## Goal

Add a local, read-only `osq serve` surface that makes osq's existing delivery
evidence explorable without creating another source of truth. A loopback Node
HTTP server will project fresh filesystem state into stable JSON, while one
small React and Vite workspace renders a delivery report, capability archive
graph, and detailed change view from those documents.

## Verify

`pnpm verify`

The suite builds the production UI, enforces its asset and import boundaries,
server-renders all three views from inlined fixture data, and starts the real
server on an ephemeral loopback port against a temporary fixture. It exercises
the CLI, APIs, static assets, method rejection, and SSE invalidation without a
network service, browser, TTY, or real model.

## Non-goals

- Any write endpoint, approval or inbox action, authentication, token, remote
  binding, hosting, or browser-side editing.
- Starting the watcher, spawning an agent, or changing markers from the server.
- An inbox page; `/api/inbox` exists only as the phase-2 data contract.
- Static export, server-side rendering in production, or a second UI build.
- A server framework, router, state library, chart library, design system, web
  font, analytics, or external request.
- Replacing terminal report, inbox, status, or show output.
- Estimating absent cost, token, time, planner, or lifecycle evidence.
- Comparing legacy and resolver-2 scope sizes as though they were one series.

## Contract

### Requirement: Loopback dashboard command

`osq serve [--port <n>] [--open]` SHALL start one Node `http` server bound only
to `127.0.0.1`. The CLI port SHALL take precedence over `serve.port`, whose
default is `4173`; port `0` SHALL request an ephemeral port for programmatic use.
The selected port SHALL be an integer from 0 through 65535. After listening,
the command SHALL print the actual `http://127.0.0.1:<port>/` URL and `--open`
SHALL launch that URL through the platform's default browser without adding a
runtime dependency.

An address-in-use or startup error SHALL print one actionable error and exit
nonzero. SIGINT and SIGTERM SHALL close the HTTP server and filesystem watcher.
The command SHALL neither run the osq watcher nor mutate project, cursor, or
change files.

#### Scenario: Default local server
- **WHEN** a user runs `osq serve` with no port option
- **THEN** the server listens on `127.0.0.1` at the configured default and stdout reports its exact URL

#### Scenario: Ephemeral integration server
- **WHEN** a caller starts the server with port zero
- **THEN** the returned handle and printed URL contain the operating system assigned loopback port

#### Scenario: Port is unavailable
- **WHEN** another process already owns the selected loopback port
- **THEN** serve exits nonzero without opening a browser or leaving a filesystem watcher running

### Requirement: Fresh read-only API

Every API request SHALL derive its response from the current filesystem and
SHALL retain no document cache beyond that request. `GET /api/report` SHALL
return the exact `MetricsReport` produced by `getMetricsReport` without wrapping
or changing it. `GET /api/inbox` SHALL read the existing last-look cursor and
return the same stable `Inbox` projection as a contemporaneous first
`osq --json` invocation, but SHALL NOT advance the cursor. A request failure
SHALL return a JSON error with an appropriate 4xx or 5xx status without process
termination.

GET and HEAD SHALL be the only accepted methods. HEAD SHALL return the matching
GET status and headers without a body. Every other method, including a POST to
an unknown path, SHALL return 405 with `Allow: GET, HEAD`; an unknown API GET
SHALL return 404. The server SHALL emit no permissive CORS header and SHALL send
`Cache-Control: no-store` for API documents.

#### Scenario: Report parity
- **WHEN** the report endpoint is requested
- **THEN** its decoded body is deeply equal to `getMetricsReport` for the same project snapshot

#### Scenario: Inbox parity without mutation
- **WHEN** the inbox endpoint is requested before the bare JSON CLI against the same fixture and clock
- **THEN** the two decoded inbox objects are deeply equal and only the CLI invocation advances last-look state

#### Scenario: Unsupported mutation method
- **WHEN** a client posts to any server path
- **THEN** the response is 405 and no project or cursor file changes

### Requirement: Capability and change graph document

`GET /api/graph` SHALL return deterministically ordered capability and change
nodes plus typed edges. Capability nodes SHALL come from current
`openspec/specs/<capability>/spec.md` folders and include the capability id and
complete current spec text. Change nodes SHALL come from active, archived, and
rejected change folders and include a stable folder key, numeric id, slug,
title, location-derived state, nullable created, approved, and landed dates,
nullable planner, task count, execution attempts, and observed metric summary.
Rejected nodes SHALL remain in the document with their recorded rejection
reason and timestamp when available.

The metric summary SHALL contain separate execution and planning cost values
with their `reported of total` attempt or session coverage, token totals grouped
by recorded harness and model with cache counts, covered task durations, and
first-attempt pass numerator and denominator. Missing planning records SHALL
produce a null planning cost, not zero; no missing metric SHALL be estimated.
This compact summary is the single additional cross-change projection used by
the page's charts while `/api/report` remains unchanged.

Edges SHALL be emitted once per declared relationship as `depends_on` from a
change to a present change, `reads` from a change to a capability named by
`features.reads`, and `writes` from a change to each delta folder under its
`specs/` directory. Edge keys and all node and edge arrays SHALL be stable for
the same files.

#### Scenario: Mixed repository history
- **WHEN** current capabilities plus active, archived, and rejected changes are present
- **THEN** graph JSON contains each folder once with recorded metadata, observations, and deterministic typed edges

#### Scenario: Delta folders declare writes
- **WHEN** one change contains more than one capability delta folder
- **THEN** graph JSON contains one writes edge from that change to each corresponding capability

#### Scenario: Planning evidence begins late
- **WHEN** older changes lack planning records and later changes contain them
- **THEN** older graph nodes retain null planning cost while later nodes expose only observed cost and coverage

### Requirement: Detailed change document

`GET /api/changes/<id>` SHALL resolve an unambiguous active, archived, or
rejected change by numeric id or folder key and return its location, title,
state, nullable planner, brief body when present, proposal goal, and request
timestamp. Each task SHALL contain title, declared and currently resolved scope
files, acceptance lines, verify command, current state, execution attempts,
nullable dead or regressed reason, nullable running start and elapsed seconds,
observed duration and cost with coverage, typed human recertifications, and
verbatim result text when present.

Change detail SHALL compose the existing parsers, state derivation, scope
resolver, planning reader, report event semantics, and show projection instead
of maintaining incompatible marker or event rules. Missing and malformed
optional history SHALL become null or empty values without hiding valid task
data. Ambiguous ids SHALL return 409, absent ids 404, and percent-decoded path
separators or traversal SHALL be rejected.

#### Scenario: Archived recertified change
- **WHEN** a change has resolved scope, a result, execution observations, and a typed recertification event
- **THEN** its document exposes those fields with the recertification actor identified as human and no inferred values

#### Scenario: Brief is absent
- **WHEN** a change has no brief file
- **THEN** the document retains a null brief and the complete proposal goal

#### Scenario: Rejected change is selected
- **WHEN** a rejected graph node is requested by its unique key
- **THEN** the endpoint returns its preserved task and rejection evidence without treating it as active or landed

### Requirement: Debounced invalidation stream

`GET /api/events` SHALL be a server-sent event stream backed by one server-owned
chokidar watcher over the configured OpenSpec root and discovered `.run`
directories. Filesystem notifications SHALL be accumulated for
`serve.eventDebounceMs`, defaulting to 100 milliseconds, then emitted to every connected client as one
`changed` event whose JSON data contains sorted affected numeric change ids.
A capability or root-level change with no single affected change SHALL use an
empty id list. No report, graph, change, file content, or other project state
SHALL travel over SSE.

The page SHALL treat SSE only as invalidation: it SHALL refetch the common
documents and any open affected change through the data module. Disconnecting
the final client SHALL not create another watcher, and server shutdown SHALL
close the one watcher and every open response.

#### Scenario: Several writes in one window
- **WHEN** several watched paths under one change are touched inside one debounce window
- **THEN** each connected client receives one changed event naming that change once

#### Scenario: Living capability changes
- **WHEN** a current capability spec changes
- **THEN** clients receive one changed event with an empty change-id list and refetch shared documents

### Requirement: Bundled UI architecture

A private pnpm workspace at `packages/ui` SHALL contain a strict TypeScript
React application built by Vite on the Node 24 LTS project toolchain. React, React DOM, their type packages, and
Vite SHALL be build-time workspace dependencies; the published CLI's runtime
dependency set SHALL not grow. No React router or Vite React plugin is required:
the application SHALL use a small hash router and Vite's TypeScript/JSX
pipeline. Charts and the archive graph SHALL use application-owned inline SVG
without d3 or another chart package.

One data module SHALL own all access to report, graph, inbox, change, and event
documents. It SHALL prefer a typed `window.__OSQ_DATA__` document when present
and otherwise use same-origin `/api/*` requests; components SHALL receive data
and callbacks and SHALL NOT call fetch or construct an EventSource. The inlined
shape SHALL support report, graph, inbox, and a keyed change map so the same
build can later power a static snapshot.

The UI SHALL import `MetricsReport`, `Inbox`, graph, and change contracts with
`import type` only. No file under `src/` SHALL import from `packages/ui`, and no
UI file SHALL import a runtime value from `src/`. The app SHALL make no external
request, remain usable at narrow widths, use system fonts, and respect
`prefers-color-scheme`.

#### Scenario: Inlined fixture data
- **WHEN** `window.__OSQ_DATA__` contains every document needed by a route
- **THEN** all three views render without fetch, EventSource, or another data source

#### Scenario: Live server data
- **WHEN** no inlined document is present
- **THEN** only the data module loads same-origin API documents and subscribes to invalidations

#### Scenario: Import graph boundaries
- **WHEN** repository architecture checks inspect source and UI imports
- **THEN** core never depends on UI and UI references core contracts only through erased type imports

### Requirement: Delivery report view

The report route SHALL render five purpose-labeled inline SVG charts from the
report and graph documents: cost per landed change over time with distinct
stacked execution and planning observations; tokens grouped by recorded model
and harness with cache share; first-attempt task pass rate in consecutive
landed windows of at most five changes; the distribution of covered task
durations; and cumulative writes per capability over landed time.

Every displayed cost SHALL place its `n of m` coverage beside the value.
Planning series SHALL be absent before the first change carrying a valid
planning record, and the chart SHALL mark that boundary rather than draw a
zero-valued history. Scope size evidence SHALL render legacy and resolver-2
series separately, never merge them, and SHALL show the five scope-regression
counters in a compact table. Empty or partially covered data SHALL be labeled
unavailable rather than estimated.

#### Scenario: Covered and uncovered costs
- **WHEN** landed changes contain mixed execution and planning cost coverage
- **THEN** cost marks and accessible text show each observed value with its own n-of-m coverage

#### Scenario: Resolver generations coexist
- **WHEN** report data contains legacy and resolver-2 size evidence
- **THEN** the view draws two labeled series without a cross-generation comparison

#### Scenario: Planning boundary
- **WHEN** the first observed planning record occurs after older landed changes
- **THEN** planning cost begins at a visible boundary and no earlier zero planning series is drawn

### Requirement: Capability archive graph view

The graph route SHALL draw one horizontal lane per current capability and place
changes left to right by landed date. A change SHALL connect every capability
lane it writes; active changes SHALL sit at a distinct right edge style, and
rejected changes SHALL be hidden initially with an explicit toggle.
`depends_on` and `reads` edges SHALL have visibly different styles and
independent visibility controls. A fill control SHALL switch change encoding
between observed total cost and attempts without hiding missing coverage.

Pointer or keyboard focus SHALL reveal title, date, planner, task count,
attempts, cost, and coverage. Activating a change SHALL navigate to its change
route. Activating a lane header SHALL display the complete current capability
spec text from the graph document. The visualization SHALL remain available in
a horizontally scrollable region on narrow screens and expose equivalent text
labels for its controls and nodes.

#### Scenario: Multi-capability archived change
- **WHEN** one archived change has two writes edges
- **THEN** one change mark visibly spans or connects both capability lanes and can open its change view

#### Scenario: Relationship controls
- **WHEN** a user toggles reads, dependencies, rejected nodes, or fill metric
- **THEN** only the selected visual encoding changes and the underlying document remains untouched

### Requirement: Change evidence view

The change route SHALL show the brief body when present; otherwise it SHALL
show the proposal goal under a visible `brief absent` label. It SHALL show the
planner and a task table containing state, attempts, recorded reason, duration,
cost, and cost coverage. Declared scope, resolved scope, acceptance lines,
verify command, human recertifications, and result text SHALL remain available
per task, with result text collapsed initially.

A running task SHALL show its server-derived elapsed time. Each relevant SSE
invalidation SHALL refetch the change so state and elapsed time advance without
client-side marker interpretation. Missing duration, cost, reason, planner,
brief, result, or recertification evidence SHALL have an explicit unavailable
or empty presentation and SHALL never be synthesized.

#### Scenario: Result and recertification details
- **WHEN** a completed task has result text and a human recertification
- **THEN** the row exposes the recertification and keeps the verbatim result in a closed disclosure control

#### Scenario: Running task invalidates
- **WHEN** a watched event arrives for the open running change
- **THEN** the data module refetches it and the table renders the new state and elapsed value

### Requirement: Static asset serving and budgets

The production UI SHALL be staged at package-root `ui/dist` by the root build
used by `prepublishOnly`, included in the root package `files`, and served from
one `resolveUiDir()` boundary. Static resolution SHALL allow only regular files
inside that directory, reject traversal and directory listing, serve correct
content types, and support the hash-routed index at `/`. The HTML response SHALL
carry a self-only content security policy; fingerprinted assets may be cached
immutably while the index is revalidated.

`pnpm verify` SHALL typecheck, test, lint, and production-build both packages.
It SHALL fail when all regular files below staged `ui/dist` total more than
1,000,000 bytes, when a non-grandfathered source file under `packages/ui`
exceeds 250 lines, or when the UI/runtime import boundary is violated. Packed
and installed CLI smoke coverage SHALL prove `ui/dist/index.html` exists and a
consumer can start `osq serve` without React or Vite in runtime dependencies.

#### Scenario: Published dashboard
- **WHEN** the root package is built, packed, and installed into an isolated project
- **THEN** its CLI serves the staged UI while its runtime dependency set contains no frontend package

#### Scenario: Asset budget exceeded
- **WHEN** staged UI regular files total more than one million bytes
- **THEN** the ordinary repository verification gate fails with the measured total

## Human steps

- Let dependency 043 finish and archive before approving or executing this
  change; task bodies will be written against 043's final planning and show
  contracts, not its in-progress worktree.
- Confirm `4173` as the default dashboard port and `ui/dist` as a shipped npm
  package path. The proposed CLI runtime dependency set remains unchanged.
- Confirm the repository-wide Node baseline update from 22 to the Node 24 LTS
  line. The current verified LTS release at planning time is 24.21.0; task
  bodies will align package engines, CI, documentation, and UI tooling.
- Review this parent contract, delta specs, and task titles. After task bodies
  are added and lint is clean, run `pnpm osq approve 044` yourself. Neither the
  planner nor an executor approves the change.

## Delta

- `specs/cli-foundation/spec.md`: serve configuration and CLI behavior plus
  production UI build, package, and installed-consumer guarantees.
- `specs/web-inspection/spec.md`: fresh graph/change documents, read-only HTTP
  and SSE transport, the shared UI data boundary, three views, and frontend
  architecture and budget rules.

The later task bodies will identify `package.json`, `pnpm-lock.yaml`,
`pnpm-workspace.yaml`, `src/cli/index.ts`, the UI application shell, and the
server composition root as intentionally shared files, with every extension
ordered after the task that first owns the file.
