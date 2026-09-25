# Spec Delta: Metrics and Reporting

## ADDED Requirements

### Requirement: Traceability gaps in report
<!-- source: src/core/report/report-traceability.ts, src/core/report/report.ts, src/cli/report.ts, tests/trace-report.test.ts -->
When at least one capability is opted in, `osq report` SHALL list, for each
opted-in capability with a living spec, in name order:

- the untested scenarios: the living spec's scenarios that no scenario test
  file in the repository names, in spec order
- the unclaimed functions: exported functions the scanner reads, in files
  outside scenario test files and test paths that the capability's Code
  ownership covers, that no `@scenario` tag claims for any capability. They
  are sorted by file, then line.

The stable JSON SHALL hold them under `traceability` as
`[{ capability, untestedScenarios: [<name>], unclaimedFunctions: [{ file, name }] }]`.
The text output SHALL print a `Traceability:` section with one line per
capability, `  <capability>: <n> untested scenarios, <m> unclaimed functions`,
followed by `    untested: <name>` and `    unclaimed: <file>#<name>` lines.
With none opted in, the JSON SHALL have no `traceability` key and the text no
section, so the report is unchanged.

#### Scenario: Gaps listed
- **WHEN** pricing is opted in, its living spec has "Volume discount tiers" that no test names, and `src/pricing/quote.ts` exports an untagged `tierPrice`
- **THEN** the report lists "Volume discount tiers" as untested and `src/pricing/quote.ts#tierPrice` as unclaimed

#### Scenario: Nothing opted in
- **WHEN** no capability is opted in
- **THEN** the report's text and JSON are unchanged
