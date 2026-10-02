## ADDED Requirements

### Requirement: Provider outage gate keys
Public configuration SHALL contain `gates.providerStallSeconds`, defaulting to
300, `gates.providerRetries`, defaulting to 3, and
`gates.providerRetryDelaySeconds`, defaulting to 300. Each SHALL be a
non-negative integer, a partial gates block SHALL keep each missing key's
default, and any other value SHALL be rejected with an error naming the key.

#### Scenario: Defaults
- **WHEN** configuration declares no `gates` block, or one without these keys
- **THEN** `gates.providerStallSeconds` is 300, `gates.providerRetries` is 3, and `gates.providerRetryDelaySeconds` is 300

#### Scenario: Invalid value
- **WHEN** `gates.providerRetries` is negative, fractional, or not a number
- **THEN** loading the configuration fails with `gates.providerRetries must be a non-negative integer`
