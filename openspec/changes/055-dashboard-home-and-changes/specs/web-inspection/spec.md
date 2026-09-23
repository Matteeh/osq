# Spec Delta: Web Inspection

## MODIFIED Requirements

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

## ADDED Requirements

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
