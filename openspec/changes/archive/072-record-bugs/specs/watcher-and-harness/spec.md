# Spec Delta: Watcher and Harness

## MODIFIED Requirements

### Requirement: Run manifest at approval
<!-- source: src/core/spec/approve.ts, src/core/run/manifest.ts, src/core/report/planning.ts, tests/manifest.test.ts, tests/manifest-creation.test.ts, tests/planning-observed-approve.test.ts, tests/approve-confirm.test.ts -->
The approve command SHALL write `.run/manifest.json` containing
content-addressed instruction, config, and capability hashes; execution
identity; `createdAt`; `approvedAt`; `planningSessions`, the number of valid
owned and observed `plan_started` records; nullable `planner` attribution; and
`approvalFlags` with the distinct sorted flag `ids` of this approval and a
`mode` of `confirmed` when they were confirmed at a prompt, else `shown`.
`osq plan` SHALL write the same manifest without `approvedAt` and
`approvalFlags`.

`createdAt` SHALL be an existing manifest's `createdAt`, kept together with its
`createdAtSource` when present. Without one, it SHALL be the change folder's
birth time, recorded with `createdAtSource: "created"`, and otherwise the
current time, marked `created` only when `osq plan` writes it.

`planner` SHALL use the model from the most recent observed session that reports
one, then the most recent owned `--session` record that reports one, else null.
Configuration alone SHALL never populate it. Planning logs remain below
`.run/` and SHALL NOT affect the approved content hash.

#### Scenario: Manifest written on approval
- **WHEN** `osq approve` seals a change
- **THEN** `.run/manifest.json` contains content hashes, execution identity, `createdAt`, `approvedAt`, planning-session count, observed planner attribution, and approval flags

#### Scenario: Manifest written at plan time
- **WHEN** `osq plan` creates a change
- **THEN** its manifest carries `createdAt` with `createdAtSource: "created"` and no `approvedAt`

#### Scenario: Approval keeps the creation time
- **WHEN** a planned change is approved, amended, and approved again
- **THEN** each manifest keeps the plan-time `createdAt` and `createdAtSource`, and `approvedAt` is the latest approval

#### Scenario: Approval without a prior manifest
- **WHEN** a change created by `osq new` without a manifest is approved on a filesystem that reports folder birth time
- **THEN** `createdAt` is the folder's birth time with `createdAtSource: "created"`

#### Scenario: Approval after multiple planning sessions
- **WHEN** a change with valid owned and observed starts is approved
- **THEN** the manifest counts every valid start while the approved content hash remains independent of the planning log

#### Scenario: Manifest hashes are content-addressed
- **WHEN** manifest input files are hashed
- **THEN** each hash is `sha256:<hex>` from UTF-8 content or null when the file does not exist

#### Scenario: Observed and owned sessions precede approval
- **WHEN** valid observed and owned lifecycle pairs exist
- **THEN** the manifest counts both and attributes planner to the most recent reported observed model

#### Scenario: No session reports a model
- **WHEN** neither observed nor owned planning history supplies a model
- **THEN** the manifest records `planner: null` regardless of configured planner values

#### Scenario: Approval without flags
- **WHEN** a change that trips no flag is approved
- **THEN** the manifest records `approvalFlags` with empty `ids` and mode `shown`
