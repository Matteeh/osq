# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Planning measurement configuration
<!-- source: src/core/foundation/config-planning.ts, src/core/foundation/config.ts, src/index.ts, tests/config-planning.test.ts -->
Configuration SHALL contain a `planning` block with `idleGapMinutes`, a
positive finite number defaulting to 10, and optional `prices`, a map from model
id to non-negative finite USD prices per million `input`, `output`,
`cacheRead`, and `cacheWrite` tokens. A partial block SHALL keep the defaults,
and an invalid value SHALL be rejected with a diagnostic naming its key.

#### Scenario: Default planning configuration
- **WHEN** no `planning` block is configured
- **THEN** resolved configuration has `planning.idleGapMinutes` 10 and no prices

#### Scenario: Price table
- **WHEN** `planning.prices` names a model with all four prices
- **THEN** resolved configuration keeps that entry and the default idle gap

#### Scenario: Invalid planning value
- **WHEN** `planning.idleGapMinutes` is zero or negative, or a price is negative, missing, or not a number
- **THEN** configuration validation fails naming the offending key
