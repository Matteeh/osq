# rust-agents Specification

## Purpose
The agents kernel reads the agent folders, each with a skill file, a config and an output contract, which each harness turns into its tool's native form.

## Requirements

### Requirement: Code ownership
<!-- source: crates/kernel/agents/** -->
The rust-agents capability SHALL own the `osq-kernel-agents` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Agents crate ownership
- **WHEN** file ownership is resolved for the agents kernel
- **THEN** system maps `crates/kernel/agents/**` to rust-agents
