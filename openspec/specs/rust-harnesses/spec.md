# rust-harnesses Specification

## Purpose
The harnesses kernel starts one harness tool per role, such as Claude Code, OpenCode or Pi, passes it the prompt, and translates its stream into events.

## Requirements

### Requirement: Code ownership
<!-- source: crates/kernel/harnesses/** -->
The rust-harnesses capability SHALL own the `osq-kernel-harnesses`
crate: its manifest, its source, its tests and their fixtures.

#### Scenario: Harnesses crate ownership
- **WHEN** file ownership is resolved for the harnesses kernel
- **THEN** system maps `crates/kernel/harnesses/**` to rust-harnesses
