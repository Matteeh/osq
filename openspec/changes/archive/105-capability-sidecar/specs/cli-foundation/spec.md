## ADDED Requirements

### Requirement: Capability groups configuration
<!-- source: src/core/foundation/config-capability-groups.ts, src/core/foundation/config.ts, src/core/foundation/config-user.ts, tests/config-capability-groups.test.ts -->
`osq.config.ts` MAY set `capabilities.requireGroups` to a boolean. The
resolved config SHALL always hold `capabilities`, defaulting to
`{ requireGroups: false }`, and a value that is not a boolean SHALL fail
with `capabilities.requireGroups must be a boolean`.

#### Scenario: Default
- **WHEN** a project's config sets no `capabilities`
- **THEN** the resolved `capabilities.requireGroups` is false

#### Scenario: Opt in
- **WHEN** it sets `capabilities: { requireGroups: true }`
- **THEN** the resolved `capabilities.requireGroups` is true

#### Scenario: Invalid
- **WHEN** it sets `capabilities: { requireGroups: 'yes' }`
- **THEN** defining the config fails with `capabilities.requireGroups must be a boolean`

### Requirement: Capability sidecar guidance
<!-- source: README.md, osq.config.ts, openspec/specs/*/osq.yml, tests/own-sidecars.test.ts -->
osq's own `osq.config.ts` SHALL set `capabilities.requireGroups` to true,
and every osq capability SHALL have a sidecar with the group the change
names: cli-foundation `platform`, spec-lint-and-approve and traceability
`planning`, watcher-and-harness and version-control `execution`, and
status-inspection, web-inspection, and metrics-and-reporting `inspection`.
README.md SHALL describe, in its `## Change folder` section, the sidecar
file and its keys, the `{ name, group }` form of `creates`, replacement
sidecars in a change, `capabilities.requireGroups` and what it enforces,
and `osq migrate sidecars`.

#### Scenario: Own sidecars
- **WHEN** every `openspec/specs/<capability>/osq.yml` in the repository is read with `parseSidecar`
- **THEN** each parses with the group named here, and `loadConfig` on the repository root gives `capabilities.requireGroups` true

#### Scenario: README
- **WHEN** README.md is read
- **THEN** its `## Change folder` section holds `osq.yml`, `requireGroups`, and `osq migrate sidecars`
