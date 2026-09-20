# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Interactive harness adapter spawning
<!-- source: src/harness/types.ts, src/harness/opencode.ts, src/harness/agy.ts, src/harness/mock.ts, tests/harness-interactive.test.ts -->
Harness adapters SHALL implement `spawnInteractive` inheriting terminal stdio and returning the process exit code.

#### Scenario: Opencode interactive session spawning
- **WHEN** `OpencodeAdapter.spawnInteractive` executes
- **THEN** adapter executes binary with inherited stdio, passing prompt, working directory, and optional model and agent flags

#### Scenario: Agy interactive session spawning
- **WHEN** `AgyAdapter.spawnInteractive` executes
- **THEN** adapter executes binary with inherited stdio, passing prompt via `-i`, and optional model and agent flags