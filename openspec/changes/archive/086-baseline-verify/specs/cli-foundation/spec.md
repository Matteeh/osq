## ADDED Requirements

### Requirement: Baseline verify configuration
<!-- source: src/core/foundation/config-gates.ts, tests/baseline-key.test.ts -->
`gates.baselineVerify` in `osq.config.ts` MAY name the command the watcher
runs as a change's baseline. When set, it SHALL be a non-empty string after
trimming, and validation SHALL keep it trimmed. When it is unset,
`validateGatesConfig` SHALL leave the key out of its result, and no baseline
SHALL run.

#### Scenario: Command set
- **WHEN** `osq.config.ts` sets `gates: { baselineVerify: ' pnpm verify ' }`
- **THEN** the loaded gates carry `baselineVerify: 'pnpm verify'`

#### Scenario: Empty command
- **WHEN** `osq.config.ts` sets `gates: { baselineVerify: '  ' }`
- **THEN** loading fails with `gates.baselineVerify must be a non-empty command`
