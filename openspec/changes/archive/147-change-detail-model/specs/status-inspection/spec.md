## ADDED Requirements

### Requirement: Change detail model
`SpecDetails` SHALL be built by model modules that read the change folder and
rendered by modules that read no files, with `src/core/status/show.ts` a
facade of re-exports. From both `getSpecDetails` and
`getSpecDetailsFromFolder` it SHALL carry the proposal's Surface, Decisions
and Before approval text as `surface`, `decisions` and `beforeApproval`,
empty when absent, and as `digest` the `buildApprovalDigest` digest for a
change without `.run/approved`, else null.

#### Scenario: Unapproved change carries its approve view
- **WHEN** `getSpecDetails` reads an unapproved change whose proposal has a Surface line, a Decisions line and a Before approval step
- **THEN** `surface`, `decisions` and `beforeApproval` hold those texts and `digest` equals `buildApprovalDigest` for the folder

#### Scenario: Approved change has no digest
- **WHEN** `getSpecDetails` or `getSpecDetailsFromFolder` reads a change with `.run/approved`
- **THEN** `digest` is null and the three proposal fields still hold the proposal's text

#### Scenario: Renderer reads no files
- **WHEN** the show renderer modules are inspected
- **THEN** none imports `node:fs` or `node:fs/promises`, and `show.ts` defines no function of its own

### Requirement: Show output from the model
`formatShowText` SHALL print the change detail followed, when the model has a
digest, by the digest and flag lines `osq approve` prints. `formatShowJson`
SHALL print the model as JSON without `surface`, `decisions` and
`beforeApproval` and with `digest` as its last key. `osq show` and
`osq show --json` SHALL print through them and print what they printed
before. The show modules SHALL pass the source-line and function budgets
without allow-list or grandfather entries.

#### Scenario: Output is unchanged
- **WHEN** `osq show <id> --json` runs on an unapproved change
- **THEN** the JSON has no `surface`, `decisions` or `beforeApproval` key and `digest` is its last key

#### Scenario: Text keeps the digest last
- **WHEN** `osq show <id>` runs on an unapproved change
- **THEN** the output ends with the same digest and flag lines `osq approve` would print
