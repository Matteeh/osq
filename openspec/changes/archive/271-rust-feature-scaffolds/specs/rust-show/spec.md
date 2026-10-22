# Spec Delta: rust-show

## Purpose
The show feature prints one change's details as TypeScript's `osq show` does. It holds the feature's logic and its command, as ADR 022 says.

## ADDED Requirements

### Requirement: Code ownership
<!-- source: crates/features/show/** -->
The rust-show capability SHALL own the `osq-feature-show` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Show crate ownership
- **WHEN** file ownership is resolved for the show feature
- **THEN** system maps `crates/features/show/**` to rust-show

### Requirement: Show feature
`osq-feature-show` SHALL expose one public item, `ShowFeature`, a unit
struct that implements core's `Feature`. Its `name()` is `show`, its
`commands()` is empty, and `run` refuses every invocation with
`FeatureError::unknown_command` naming the invocation's command. The crate
depends only on `osq-core`.

#### Scenario: Empty show feature
- **WHEN** a test asks `ShowFeature` for its name and commands, and runs it with each command below on a scratch project root and no arguments
- **THEN** its name is `show`, it lists no command, and each run returns `FeatureError::unknown_command` displaying as the row's text:

| Command | Text |
|---|---|
| `show` | `unknown command: show` |
| `inbox` | `unknown command: inbox` |
