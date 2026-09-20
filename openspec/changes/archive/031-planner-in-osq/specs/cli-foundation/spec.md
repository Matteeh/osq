# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Planner configuration validation
<!-- source: src/core/config.ts, tests/config-planner.test.ts -->
The configuration subsystem SHALL support and validate an optional `planner` block defining `harness`, `model`, and optional `agent`.

#### Scenario: Rejection of invalid planner configuration
- **WHEN** `planner` is configured with an empty string or unrecognized harness
- **THEN** `defineConfig` throws a descriptive validation error

### Requirement: Opencode planner agent configuration
<!-- source: src/harness/opencode.ts, tests/opencode-planner-setup.test.ts -->
The setup command for the opencode harness SHALL generate `.opencode/agent/osq-planner.md` with restricted planning tool permissions.

#### Scenario: Planner agent permissions and idempotence
- **WHEN** `osq setup` executes with `opencode` harness configured
- **THEN** system generates `.opencode/agent/osq-planner.md` permitting `read`, `write`, `edit`, `glob`, `grep`, denying `bash`, `git`, `webfetch`, `websearch`, and repeated runs remain byte-identical

### Requirement: Interactive planning command
<!-- source: src/cli/plan.ts, src/cli/index.ts, tests/plan.test.ts -->
The CLI SHALL provide `osq plan <name> [--brief <file> | -] [-print]` to initialize changes, record briefs, and launch interactive planner sessions.

#### Scenario: New change interactive planning session
- **WHEN** user executes `osq plan <name>`
- **THEN** system creates change folder, writes `brief.md` with planner and date metadata, formats prompt with 4 ordered sections (`PLANNER.md`, change ID/title, capability spec paths, `brief.md`), and spawns an interactive session

#### Scenario: Resuming existing change planning session
- **WHEN** user executes `osq plan <id>` on an existing change folder with `brief.md`
- **THEN** system skips folder creation and launches an interactive session for the existing change

#### Scenario: Print mode outputs prompt to stdout
- **WHEN** user executes `osq plan <name> -print`
- **THEN** opening prompt is written exclusively to stdout without launching an interactive process