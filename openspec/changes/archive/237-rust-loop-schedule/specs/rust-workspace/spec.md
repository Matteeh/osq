## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: crates/kernel/vcs/**, crates/kernel/runners/**, crates/kernel/harnesses/**, crates/kernel/agents/**, crates/features/plan/**, crates/features/approve/**, crates/features/run/**, crates/features/archive/**, crates/features/land/**, crates/features/inbox/**, crates/features/report/**, crates/features/metaloop/**, crates/apps/cli/** -->
The rust-workspace capability SHALL own every placeholder crate of the
Rust workspace: the kernel crates `vcs`, `runners`, `harnesses` and
`agents`, the feature crates `plan`, `approve`, `run`, `archive`,
`land`, `inbox`, `report` and `metaloop`, and the `cli` app crate.

#### Scenario: Placeholder crate ownership
- **WHEN** file ownership is resolved for a placeholder crate
- **THEN** system maps `crates/kernel/vcs/**`, `crates/kernel/runners/**`, `crates/kernel/harnesses/**`, `crates/kernel/agents/**`, `crates/features/plan/**`, `crates/features/approve/**`, `crates/features/run/**`, `crates/features/archive/**`, `crates/features/land/**`, `crates/features/inbox/**`, `crates/features/report/**`, `crates/features/metaloop/**` and `crates/apps/cli/**` to rust-workspace
