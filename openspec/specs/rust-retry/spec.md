# rust-retry Specification

## Purpose
The retry feature clears a dead or regressed task or change so it runs again, as TypeScript's `osq retry` does. It holds the feature's logic and its command, as ADR 022 says.

## Requirements

### Requirement: Code ownership
<!-- source: crates/features/retry/** -->
The rust-retry capability SHALL own the `osq-feature-retry` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Retry crate ownership
- **WHEN** file ownership is resolved for the retry feature
- **THEN** system maps `crates/features/retry/**` to rust-retry

### Requirement: Retry feature
`osq-feature-retry` SHALL expose one public item, `RetryFeature`, a unit
struct that implements core's `Feature`. Its `name()` is `retry`, its
`commands()` is empty, and `run` refuses every invocation with
`FeatureError::unknown_command` naming the invocation's command. The crate
depends only on `osq-core`.

#### Scenario: Empty retry feature
- **WHEN** a test asks `RetryFeature` for its name and commands, and runs it with each command below on a scratch project root and no arguments
- **THEN** its name is `retry`, it lists no command, and each run returns `FeatureError::unknown_command` displaying as the row's text:

| Command | Text |
|---|---|
| `retry` | `unknown command: retry` |
| `inbox` | `unknown command: inbox` |
