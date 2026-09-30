## ADDED Requirements

### Requirement: Tests start no background git work
Every git process started during `pnpm test` SHALL run with
`maintenance.auto=false`, so no detached `git maintenance run --auto` is still
writing when a test removes its temp root. The preload `tests/git-test-env.ts`
adds the setting once, after any `GIT_CONFIG_*` entries already in
`process.env`. Both `node --test` invocations in the `test` script SHALL import
it. `tests/git-background-work.test.ts` SHALL enforce the rule.

#### Scenario: A test commits
- **WHEN** a test commits in its temp repository under the test run's environment
- **THEN** git's trace2 event log records no `git maintenance` child

#### Scenario: A commit outside the test environment
- **WHEN** the same commit runs with `maintenance.auto=true` and none of the preload's variables
- **THEN** git's trace2 event log records a `git maintenance run --auto` child

#### Scenario: Existing git configuration in the environment
- **WHEN** the environment already sets `GIT_CONFIG_COUNT=1` with one key and value
- **THEN** the preload keeps that entry, adds `maintenance.auto=false` as entry 1, and sets `GIT_CONFIG_COUNT=2`

#### Scenario: The preload runs twice
- **WHEN** the preload applies to an environment it already changed
- **THEN** the environment is unchanged

#### Scenario: A test script drops the preload
- **WHEN** a `node --test` invocation in the `test` script of `package.json` does not import `./tests/git-test-env.ts`
- **THEN** `tests/git-background-work.test.ts` fails, naming the invocation
