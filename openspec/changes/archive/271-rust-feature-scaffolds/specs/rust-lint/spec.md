# Spec Delta: rust-lint

## Purpose
The lint feature checks a change folder with the specs kernel's validation and the linter kernel's gates and prints the findings, as TypeScript's `osq lint` does. It holds the feature's logic and its command, as ADR 022 says.

## ADDED Requirements

### Requirement: Code ownership
<!-- source: crates/features/lint/** -->
The rust-lint capability SHALL own the `osq-feature-lint` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Lint crate ownership
- **WHEN** file ownership is resolved for the lint feature
- **THEN** system maps `crates/features/lint/**` to rust-lint

### Requirement: Lint feature
`osq-feature-lint` SHALL expose one public item, `LintFeature`, a unit
struct that implements core's `Feature`. Its `name()` is `lint`, its
`commands()` is empty, and `run` refuses every invocation with
`FeatureError::unknown_command` naming the invocation's command. The crate
depends only on `osq-core`.

#### Scenario: Empty lint feature
- **WHEN** a test asks `LintFeature` for its name and commands, and runs it with each command below on a scratch project root and no arguments
- **THEN** its name is `lint`, it lists no command, and each run returns `FeatureError::unknown_command` displaying as the row's text:

| Command | Text |
|---|---|
| `lint` | `unknown command: lint` |
| `inbox` | `unknown command: inbox` |
