## ADDED Requirements

### Requirement: Sidecar coverage
<!-- source: src/core/report/report.ts, src/cli/report.ts, tests/report-sidecars.test.ts -->
When the project has at least one living capability spec,
`getMetricsReport` SHALL set `coverage.capabilities` to
`{ withSidecar: [<capability>], withoutSidecar: [<capability>] }`, each in
name order, and the stable JSON SHALL carry it. With no living capability
spec, `coverage` SHALL have no `capabilities` key, so the report is
unchanged.

#### Scenario: Counted
- **WHEN** a project has living `orders` and `pricing` specs and only `pricing` has a sidecar
- **THEN** `osq report --json` holds `coverage.capabilities` with `withSidecar: ["pricing"]` and `withoutSidecar: ["orders"]`

#### Scenario: No living specs
- **WHEN** a project has no living capability spec
- **THEN** `coverage` has no `capabilities` key
