# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Scope resolver upgrade guidance
<!-- source: README.md, tests/scope-resolver-upgrade.test.ts -->
Consumer guidance SHALL contain one `Upgrading` note explaining that resolver 2
changes automated done-marker hashes for active changes. It SHALL state that
the watcher runs each affected task's verification at detection, writes one
idempotent scope-regression marker, and requires the human to review it and run
`osq retry <id> <task>` for recertification.

The guidance SHALL state that archived markers are untouched and SHALL NOT
suggest editing markers, bypassing verification, automatic acceptance, or bulk
retry.

#### Scenario: Upgrading with active legacy completions
- **WHEN** a user upgrades while an active change has automated done markers without `scope_resolver: 2`
- **THEN** README explains the one-time detection wave and the explicit retry command that recertifies each task

#### Scenario: Archived completion history
- **WHEN** a user reads the resolver upgrade note
- **THEN** it states that markers already under the archive are not rewritten or audited by the migration
