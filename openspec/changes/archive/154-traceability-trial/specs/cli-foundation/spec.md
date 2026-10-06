## ADDED Requirements

### Requirement: osq traces its own traceability capability
osq's own `osq.config.ts` SHALL set `traceability` to
`capabilities: ['traceability']`, `mode: 'warn'`, `focusedTests:
'node --import tsx --import ./tests/git-test-env.ts --test --test-reporter=tap {files}'`,
and `mutation: { command: 'npx stryker run', budgetSeconds: 300 }`. ADR 011
governs the trial. `tsconfig.json` SHALL map `@matteeh/osq/testing` to
`./src/testing/index.ts` under `compilerOptions.paths`, so a test imports the
helper by its package name with no build. AGENTS.md and PLANNER.md SHALL
carry the traceability blocks `osq init` writes for this config.

#### Scenario: Own traceability config
- **WHEN** `loadConfig` reads osq's own repository
- **THEN** its `traceability` is `traceability` in `warn` mode, with the tsx focused command and `npx stryker run` under a 300-second budget

#### Scenario: Helper by package name
- **WHEN** a test under `tests/` imports `scenario` from `@matteeh/osq/testing` and from `../src/testing/index.js`
- **THEN** both are the same function

#### Scenario: Report lists the capability
- **WHEN** `collectTraceabilityGaps` runs on osq's own repository with its own config
- **THEN** it returns one entry, for `traceability`

### Requirement: osq's own mutation setup
osq's repository SHALL hold `@stryker-mutator/core` 10.0.0 as an exact dev
dependency and a root `stryker.config.mjs`. Its `mutate` SHALL be
`OSQ_MUTATE` parsed as JSON, its command runner SHALL run
`node --import tsx --import ./tests/git-test-env.ts --test` with each
`OSQ_MUTATION_TESTS` entry single-quoted, and its JSON report SHALL go to
`OSQ_MUTATION_REPORT`. Its `tempDirName` SHALL be `stryker` in the folder of
`OSQ_MUTATION_REPORT`, or `osq-stryker` in the OS temp folder without it, so
a sandbox is never inside the tree the import graph reads.

#### Scenario: Mutation sandbox beside the report
- **WHEN** `stryker.config.mjs` loads with `OSQ_MUTATE` `["src/a.ts:1-3"]`, `OSQ_MUTATION_TESTS` `["tests/a.test.ts"]`, and `OSQ_MUTATION_REPORT` `/tmp/x/mutation.json`
- **THEN** `mutate` is `["src/a.ts:1-3"]`, the command ends with `--test 'tests/a.test.ts'`, `jsonReporter.fileName` is `/tmp/x/mutation.json`, and `tempDirName` is `/tmp/x/stryker`
