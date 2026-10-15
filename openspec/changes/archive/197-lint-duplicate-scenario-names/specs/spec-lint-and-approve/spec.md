## ADDED Requirements

### Requirement: Repeated scenario name refusal
For each capability a change's delta writes, `osq lint` SHALL parse the living
spec and the merged spec that `mergeDelta` produces with `parseCapabilitySpec`,
the merge and parse `lookupScenario` uses, and report one error for each
scenario name that appears more than once in the merged spec and at most once
in the living spec. `osq approve`, which runs lint, SHALL refuse the same
change.

#### Scenario: Delta adds a taken scenario name
- **WHEN** the living `web` spec's requirement `Approve review view` has the scenario `Phone width` and a delta ADDS the requirement `Change page` with the scenario `Phone width`
- **THEN** `osq lint` reports the change invalid with the error `web: scenario "Phone width" appears in both "Approve review view" and "Change page"; give each scenario of a capability its own name`

#### Scenario: Two added requirements share a scenario name
- **WHEN** a delta creates the capability `notes`, which has no living spec, and ADDS the requirements `Save note` and `Edit note`, each with the scenario `Saves`
- **THEN** `osq lint` reports the error `notes: scenario "Saves" appears in both "Save note" and "Edit note"; give each scenario of a capability its own name`

#### Scenario: Approval refuses a repeated scenario name
- **WHEN** `osq approve` runs on the change of "Delta adds a taken scenario name"
- **THEN** it fails with the same error and writes no `.run/approved`

### Requirement: Repeated scenario name exceptions
The repeated scenario name error SHALL be on the delta file and on the second
requirement that holds the name, in merged order, and read `<capability>:
scenario "<name>" appears in both "<first requirement>" and "<second
requirement>"; give each scenario of a capability its own name`. A name the
living spec already repeats SHALL stay allowed, and a MODIFIED requirement that
keeps a scenario under its own name SHALL NOT be reported.

#### Scenario: Name the living spec already repeats
- **WHEN** the living `web` spec's requirements `Approve review view` and `Land view` both have the scenario `Phone width` and a delta ADDS the requirement `Change page` with the scenario `Phone width`
- **THEN** `osq lint` reports no repeated scenario name error

#### Scenario: Modified requirement keeps its scenario names
- **WHEN** the living `web` spec's requirement `Approve review view` has the scenario `Phone width` and a delta MODIFIES `Approve review view`, keeping `Phone width` and changing its THEN line
- **THEN** `osq lint` reports no repeated scenario name error
