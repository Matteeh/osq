## MODIFIED Requirements

### Requirement: Feature registry
`features()` in `osq-cli` SHALL return one `Box<dyn Feature>` for every
feature crate that implements `Feature`, in this order: `PlanFeature`,
`ApproveFeature`, `RunFeature`, `ArchiveFeature`, `LandFeature`,
`InboxFeature`, `ReportFeature`, `ShowFeature`, `LintFeature`,
`DoctorFeature` and `RetryFeature`, each built with `new()` where its crate
offers one. The registry is the one list of features; help and dispatch
read only it; a crate with no `Feature` is not in it.

#### Scenario: Registered features
- **WHEN** a test reads `features()`
- **THEN** their names are `plan`, `approve`, `run`, `archive`, `land`, `inbox`, `report`, `show`, `lint`, `doctor` and `retry`, in that order

#### Scenario: Run through the registry
- **WHEN** `run_cli` runs with `features()`, a new empty folder under `CARGO_TARGET_TMPDIR` as the root, and the row's arguments
- **THEN** it returns an empty stdout, the row's stderr with `<root>` standing for the root, and code 1, and the root is still empty:

| Arguments | Stderr |
|---|---|
| `run`, `1` | `usage of run: expected <id> <task>\n` |
| `run`, `1`, `1` | `run failed: Spec "1" not found in <root>/openspec/changes\n` |
