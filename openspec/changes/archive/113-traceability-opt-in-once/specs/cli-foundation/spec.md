## ADDED Requirements

### Requirement: Traceability opt-in check
`src/core/foundation/config-traceability.ts` SHALL export
`isCapabilityOptedIn(capabilities, capability)`, true when `capabilities` is
`'all'` or lists `capability`, and `hasOptedInCapability(capabilities)`, true
when `capabilities` is `'all'` or a non-empty list. The mutation pick, the
focused test collection, the watcher's mutation check, and the report's
mutation scores SHALL use them and define none of their own.

#### Scenario: Opt-in answers
- **WHEN** `isCapabilityOptedIn` is asked about `pricing`, and `hasOptedInCapability` is called, for each `capabilities` value
- **THEN** they return:

| capabilities | isCapabilityOptedIn pricing | hasOptedInCapability |
| --- | --- | --- |
| `'all'` | true | true |
| `['pricing', 'billing']` | true | true |
| `['billing']` | false | true |
| `[]` | false | false |

#### Scenario: One opt-in definition
- **WHEN** the sources of `src/core/trace/mutation-pick.ts`, `src/core/run/focused-tests.ts`, `src/watcher/mutation-check.ts`, and `src/core/report/report-mutation.ts` are read
- **THEN** none compares `capabilities` with `'all'` itself or defines `isOptedIn` or `hasOptedInCapability`, and each imports from `src/core/foundation/config-traceability.ts`
