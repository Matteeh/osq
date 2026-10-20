# rust-workspace Specification

## Purpose
The placeholder crates of the Rust rewrite of osq: the feature, kernel and
app crates ADR 022's layers name that hold no capability's code yet. Each
crate leaves this capability, through a Code ownership delta, in the
change that gives it its own capability.

## Requirements

### Requirement: Code ownership
<!-- source: crates/kernel/vcs/**, crates/kernel/runners/**, crates/kernel/harnesses/**, crates/kernel/agents/**, crates/kernel/loop/**, crates/features/plan/**, crates/features/approve/**, crates/features/run/**, crates/features/archive/**, crates/features/land/**, crates/features/inbox/**, crates/features/report/**, crates/features/metaloop/**, crates/apps/cli/** -->
The rust-workspace capability SHALL own every placeholder crate of the
Rust workspace: the kernel crates `vcs`, `runners`, `harnesses`, `agents`
and `loop`, the feature crates `plan`, `approve`, `run`, `archive`,
`land`, `inbox`, `report` and `metaloop`, and the `cli` app crate.

#### Scenario: Placeholder crate ownership
- **WHEN** file ownership is resolved for a placeholder crate
- **THEN** system maps `crates/kernel/vcs/**`, `crates/kernel/runners/**`, `crates/kernel/harnesses/**`, `crates/kernel/agents/**`, `crates/kernel/loop/**`, `crates/features/plan/**`, `crates/features/approve/**`, `crates/features/run/**`, `crates/features/archive/**`, `crates/features/land/**`, `crates/features/inbox/**`, `crates/features/report/**`, `crates/features/metaloop/**` and `crates/apps/cli/**` to rust-workspace
