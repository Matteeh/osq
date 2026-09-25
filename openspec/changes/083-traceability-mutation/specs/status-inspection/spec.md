# Spec Delta: Status Inspection

## ADDED Requirements

### Requirement: Mutation in show
<!-- source: src/core/status/show.ts, tests/mutation-report.test.ts -->
`osq show` SHALL print, under each task whose stream holds `mutation_ran`
events after its last `measures` start event, the line
`      Mutation: <entry>; <entry>`, with one entry per event in stream order.
A measured entry is `<file>#<function> <killed> of <killed + survived> killed`,
and a not-measured one is `<file>#<function> not measured (<reason>)`. Each
survivor then gets the line
`        Survived: <file>:<line>:<column> <mutator> -> <replacement>`. These
lines come after the `Focused runs:` line. Other tasks' output SHALL be
unchanged.

#### Scenario: One survivor
- **WHEN** task 1's latest mutation check measured `quote` with 18 killed and one survivor at line 36, column 19, `ConditionalExpression` replaced with `false`
- **THEN** `osq show` prints `      Mutation: src/pricing/quote.ts#quote 18 of 19 killed` and `        Survived: src/pricing/quote.ts:36:19 ConditionalExpression -> false` under task 1
