# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Scaffolded schema refresh
<!-- source: src/core/foundation/init.ts, src/cli/init.ts, src/cli/index.ts, README.md, tests/init-refresh-schema.test.ts -->
`osq init --refresh-schema` SHALL overwrite `openspec/config.yaml`,
`openspec/schemas/osq/schema.yaml`, `openspec/schemas/osq/README.md`, and
`openspec/schemas/osq/templates/{proposal,spec,tasks}.md` from the installed
templates when their bytes differ, and SHALL print each replaced file as
`refreshed`. Files that already match SHALL stay untouched and print as
`current`, and missing files SHALL be created as usual. Everything else init
does SHALL stay the same. Without the flag, `osq init` SHALL behave and print
exactly as before.

#### Scenario: Stale consumer schema
- **WHEN** a scaffolded schema file differs from the installed template and the consumer runs `osq init --refresh-schema`
- **THEN** the file equals the installed template and init prints it as `refreshed`

#### Scenario: Current schema
- **WHEN** every scaffolded schema file already matches the installed templates
- **THEN** `osq init --refresh-schema` rewrites none of them and prints each as `current`

#### Scenario: Plain init leaves the schema alone
- **WHEN** `osq init` runs without the flag on an initialized project
- **THEN** it reports the schema files as `exists` and leaves them unchanged
