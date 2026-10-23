## MODIFIED Requirements

### Requirement: Feature registry
`features()` in `osq-cli` SHALL return one `Box<dyn Feature>` for every
feature crate that implements `Feature`, in this order: `PlanFeature`,
`ApproveFeature`, `ArchiveFeature`, `LandFeature`, `InboxFeature`,
`ReportFeature`, `ShowFeature`, `LintFeature`, `DoctorFeature` and
`RetryFeature`, each built with `new()` where its crate offers one. The
registry is the one list of features; help and dispatch read only it. A
feature crate with no `Feature`, such as run and metaloop today, is not in
it.

#### Scenario: Registered features
- **WHEN** a test reads `features()`
- **THEN** their names are `plan`, `approve`, `archive`, `land`, `inbox`, `report`, `show`, `lint`, `doctor` and `retry`, in that order
