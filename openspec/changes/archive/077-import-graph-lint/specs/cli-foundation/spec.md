# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Import graph lint limits
<!-- source: src/core/foundation/config.ts, README.md, tests/impact-lint.test.ts -->
`limits` SHALL carry `importGraphDepth`, default 2, the import levels the
frozen-test warning follows, and `maxListedImporters`, default 8, the most tests
or files one import-graph warning lists. Both SHALL merge from `osq.config.ts`
like the other limits, and the README's lint table SHALL list the four
import-graph warnings.

#### Scenario: Deeper reach
- **WHEN** `limits.importGraphDepth` is 3 and a test imports a scoped file three levels away
- **THEN** the frozen-test warning names that test
