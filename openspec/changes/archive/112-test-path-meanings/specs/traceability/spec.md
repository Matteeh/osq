## MODIFIED Requirements

### Requirement: Test paths
`isTestPath(relativePath)` in `src/core/trace/test-path.ts` SHALL return true
for `tests`, for a path under `tests/`, and for a path whose file name holds
`.test.` or `.spec.`, and false otherwise. Traceability lint's planned
scenarios, the report's traceability gaps, the system graph, and `osq show`'s
task scenarios SHALL call it and SHALL NOT define their own. It is wider than
the frozen-test gate on purpose; watcher-and-harness's "Test gate paths"
defines that one.

#### Scenario: Test and source paths
- **WHEN** `isTestPath` is called with `tests/pricing.ts`, `src/pricing/quote.test.ts`, `src/pricing/quote.spec.ts`, and `src/pricing/quote.ts`
- **THEN** it returns true, true, true, and false

#### Scenario: One definition
- **WHEN** the sources of `src/core/spec/traceability-lint.ts` and `src/core/report/report-traceability.ts` are read
- **THEN** neither defines a function named `isTestPath`, and both import it from `src/core/trace/test-path.ts`

#### Scenario: Show uses it
- **WHEN** the source of `src/core/status/show.ts` is read
- **THEN** it defines no test-path function of its own and imports `isTestPath` from `src/core/trace/test-path.ts`
