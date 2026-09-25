# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Mutation configuration
<!-- source: src/core/foundation/config-traceability.ts, tests/mutation-config.test.ts -->
`traceability.mutation` in `osq.config.ts` MAY hold `command`, a non-empty
string, and `budgetSeconds`, a positive number that defaults to 300. Setting
the block turns the mutation check on for opted-in capabilities. The resolved
`traceability` block SHALL leave `mutation` out when it is unset. `defineConfig`
SHALL throw `traceability.mutation.command must be a non-empty command` or
`traceability.mutation.budgetSeconds must be a positive number` for any other
value.

#### Scenario: Off by default
- **WHEN** `osq.config.ts` sets `traceability.capabilities` but no `mutation`
- **THEN** the resolved `traceability` block has no `mutation`

#### Scenario: Budget defaults
- **WHEN** `traceability.mutation` is `{ command: 'npx stryker run' }`
- **THEN** the resolved block holds that command and `budgetSeconds: 300`

### Requirement: Reference mutation setup
<!-- source: README.md -->
README.md SHALL document the reference StrykerJS setup: `@stryker-mutator/core`
as a dev dependency of the project, `traceability.mutation.command` set to
`npx stryker run`, and this `stryker.config.mjs`:

```
const tests = JSON.parse(process.env.OSQ_MUTATION_TESTS ?? '[]')
  .map((file) => `'build/${file.replace(/\.(m|c)?ts$/, (_, k) => `.${k ?? ''}js`)}'`)
  .join(' ');
export default {
  testRunner: 'command',
  commandRunner: { command: `node --test ${tests}` },
  buildCommand: 'npx tsc',
  mutate: JSON.parse(process.env.OSQ_MUTATE ?? '[]'),
  coverageAnalysis: 'off',
  reporters: ['json'],
  jsonReporter: { fileName: process.env.OSQ_MUTATION_REPORT },
  tempDirName: '.stryker-tmp',
};
```

It SHALL say that the config assumes `tsc` compiles `tests/` to `build/tests/`
and must follow the project's own layout. It SHALL say to leave
`thresholds.break` unset, and to add `.stryker-tmp` to `.gitignore`.

#### Scenario: Setup documented
- **WHEN** a reader looks up mutation checks in README.md
- **THEN** it shows the command, the config above, and the placeholders and environment variables osq provides
