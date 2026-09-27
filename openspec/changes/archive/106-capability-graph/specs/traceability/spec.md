## ADDED Requirements

### Requirement: Test paths
<!-- source: src/core/trace/test-path.ts, src/core/spec/traceability-lint.ts, src/core/report/report-traceability.ts, tests/trace-test-path.test.ts -->
`isTestPath(relativePath)` in `src/core/trace/test-path.ts` SHALL return true
for `tests`, for a path under `tests/`, and for a path whose file name holds
`.test.` or `.spec.`, and false otherwise. Traceability lint's planned
scenarios, the report's traceability gaps, and the system graph SHALL call it
and SHALL NOT define their own.

#### Scenario: Test and source paths
- **WHEN** `isTestPath` is called with `tests/pricing.ts`, `src/pricing/quote.test.ts`, `src/pricing/quote.spec.ts`, and `src/pricing/quote.ts`
- **THEN** it returns true, true, true, and false

#### Scenario: One definition
- **WHEN** the sources of `src/core/spec/traceability-lint.ts` and `src/core/report/report-traceability.ts` are read
- **THEN** neither defines a function named `isTestPath`, and both import it from `src/core/trace/test-path.ts`
