# Spec Delta: rust-doctor

## Purpose
The doctor feature checks the tools osq runs, such as the pi harness, and prints what is wrong, as TypeScript's `osq doctor` does. It holds the feature's logic and its command, as ADR 022 says.

## ADDED Requirements

### Requirement: Code ownership
<!-- source: crates/features/doctor/** -->
The rust-doctor capability SHALL own the `osq-feature-doctor` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Doctor crate ownership
- **WHEN** file ownership is resolved for the doctor feature
- **THEN** system maps `crates/features/doctor/**` to rust-doctor

### Requirement: Doctor feature
`osq-feature-doctor` SHALL expose one public item, `DoctorFeature`, a unit
struct that implements core's `Feature`. Its `name()` is `doctor`, its
`commands()` is empty, and `run` refuses every invocation with
`FeatureError::unknown_command` naming the invocation's command. The crate
depends only on `osq-core`.

#### Scenario: Empty doctor feature
- **WHEN** a test asks `DoctorFeature` for its name and commands, and runs it with each command below on a scratch project root and no arguments
- **THEN** its name is `doctor`, it lists no command, and each run returns `FeatureError::unknown_command` displaying as the row's text:

| Command | Text |
|---|---|
| `doctor` | `unknown command: doctor` |
| `inbox` | `unknown command: inbox` |
