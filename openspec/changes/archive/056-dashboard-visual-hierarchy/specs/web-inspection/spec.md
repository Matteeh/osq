# Spec Delta: Web Inspection

## MODIFIED Requirements

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

## ADDED Requirements

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
