---
title: osq graph prints the system as one versioned graph of nodes and edges
depends_on: ["105"]
verify: pnpm verify
features:
  reads:
    - status-inspection
    - watcher-and-harness
---
## Goal

osq already checks the links between capabilities, requirements, scenarios,
tests, functions, ADRs, and changes, but each link lives in its own reader and
nothing shows them together. This change builds one graph document from those
readers, `SystemGraph`, and serves it as `osq graph --json` and
`GET /api/system`. Every node and edge comes from a link osq already checks,
so the graph is true, and it marks the gaps: scenarios no test proves,
functions no scenario claims, and files no capability owns.

This is the data half of the `capability-graph` brief. The zoomable view in
`packages/ui` is a later change that draws this document; the document
therefore carries no layout or position.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. The graph is tested through
`getSystemGraph` on temporary projects: one built from the pricing sample in
`fixture/trace/pricing` with a sidecar, an ADR, a change, and a second
capability, and one synthetic project with 2,000 scenarios. The command is
tested through `graphCommand`, and the route through `startWebServer` on
port 0.

## Non-goals

- The zoomable view, its levels, its question views, and its URLs. They are
  the later view change, which also chooses how to draw: hand-written SVG,
  d3, or sigma, with an ADR if it adds a library.
- A function's last change. No link osq checks ties a function to a change:
  done markers work at file level and see only osq's changes, and git needs a
  process per function. The view can show a capability's changes instead,
  from the `writes` edges.
- A cache or index of the graph. Like every web document, it is rebuilt per
  request. The synthetic test prints its build time so the view change can
  decide with numbers.
- Invalidation when a source file changes. `osq serve` watches only the
  OpenSpec root and `.run` directories; the view change handles refresh.
- Inlining the graph into `osq serve --export`. Nothing in the UI reads it
  yet.
- Changing which files `digest.ts` and `test-impact.ts` treat as tests. They
  check only `tests/`, on purpose or not, and keep their own check.
- Grouping or filtering unowned files. Every unowned file is a gap; the view
  decides how to show many of them.

## Surface

- Added: `osq graph` and `osq graph --json` (command)
- Added: `GET /api/system` (HTTP route)
- Added: the `SystemGraph` document, `version: 1`, with node kinds `group`, `capability`, `requirement`, `scenario`, `adr`, `change`, `test`, `function`, and `file`, and edge kinds `contains`, `applies_to`, `reads`, `writes`, `imports`, `owns`, `proves`, `covers`, `serves`, and `follows` (output format)

## Decisions

- ADR 001: `osq graph` loads `osq.config.ts` through `loadConfig`, as every command does.
- ADR 004: unchanged; `osq graph` runs no validator.
- ADR 005: unchanged; nothing here checks the validator range.

## Background

Every source the graph needs exists and is already checked:

| Link | Reader |
|---|---|
| group of a capability | `readLivingSidecar` in `src/core/spec/capability-sidecar.ts` |
| purpose, requirements, scenarios, THEN lines, tables | `parseCapabilitySpec` in `src/core/spec/delta.ts` |
| ADRs, their status and scope | `readDecisions` and `sameAdrNumber` in `src/core/foundation/decisions.ts` |
| changes and their reads and writes | `getWebGraph` in `src/core/web/web-data-graph.ts` |
| files and their imports | `buildImportGraph` in `src/core/spec/import-graph.ts` |
| which capability owns a file | `readCapabilityOwnership` and `ownerCapabilities` in `src/core/spec/capability-impact.ts` |
| tests, tags, and coverage | `buildScenarioIndex` in `src/core/trace/scenario-index.ts` |
| surviving mutants | `collectMutationScores` in `src/core/report/report-mutation.ts` |
| untested scenarios and unclaimed functions | `report-traceability.ts`, whose gap rules the graph shares |

The brief said the graph data should be "cached by file hash like the
scenario index". The scenario index persists nothing, and the web-inspection
spec forbids a persisted index, so the graph follows the spec.

One rule exists twice, and the gap rules are private. `isTestPath`, which treats a path under `tests/` or
a file name holding `.test.` or `.spec.` as a test, is copied in
`traceability-lint.ts` and `report-traceability.ts`, and the graph needs it
a third time. Task 1 moves it to `src/core/trace/test-path.ts` and makes both
callers use it. `report-traceability.ts` also exports its opted-in and
unclaimed-function rules, so the graph's gap counts equal `osq report`'s by
construction.

Measured on osq itself on 2026-09-28: 701 JavaScript and TypeScript files, of
which 292 are owned by no capability, nearly all under `tests/`; 44
capability-to-capability import edges out of 56 possible, with test files
changing some counts sharply (traceability to cli-foundation: 17 import pairs,
1 without tests). Hence the `code` and `test` counts on each `imports` edge.
osq opts no capability into traceability, so on osq itself the graph has no
test or function nodes; the pricing sample exercises them.

`src/cli/index.ts` has 248 lines. Registering the command through
`registerGraphCommand`, as `registerMessageCommand` does, adds two.

## Contract

### Requirement: Existing documents are unchanged
`WebGraph`, `WebChange`, the report, the inbox, and every existing route and
command SHALL be unchanged.

#### Scenario: Existing suites
- **WHEN** the existing suite runs
- **THEN** every test passes unchanged

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/web-inspection/spec.md`: adds "System graph document", "System graph links", "System graph traceability", and "System graph gaps"; modifies "Read-only HTTP transport".
- `specs/cli-foundation/spec.md`: adds "Graph command".
- `specs/traceability/spec.md`: adds "Test paths".
- `specs/spec-lint-and-approve/spec.md`: modifies "Planned scenarios" to name `isTestPath`.
- `specs/metrics-and-reporting/spec.md`: modifies "Traceability gaps in report" to name `isTestPath` and export the gap rules.

Four tasks. Task 1 shares the test-path and gap rules. Task 2 builds the
graph from specs, sidecars, ADRs, changes, imports, and ownership. Task 3
adds the traceability part. Task 4 adds the command and the route.

Tasks 2 and 3 share `src/core/web/system-graph.ts` and
`src/core/web/system-graph-types.ts`: task 2 writes them, and task 3, ordered
after it, adds the traceability nodes and edges to both.
