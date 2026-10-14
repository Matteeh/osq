## ADDED Requirements

### Requirement: Usage limit wait key
Public configuration SHALL contain `gates.usageLimitWaitSeconds`, defaulting to
1800: how many seconds osq waits after a usage limit whose reset time the
harness did not give. It SHALL be a non-negative integer. A partial gates block
SHALL keep its default, and any other value SHALL be rejected with an error
naming the key.

#### Scenario: Usage limit wait default
- **WHEN** configuration declares no `gates` block, or one without `usageLimitWaitSeconds`
- **THEN** `gates.usageLimitWaitSeconds` is 1800

#### Scenario: Invalid usage limit wait
- **WHEN** `gates.usageLimitWaitSeconds` is negative, fractional, or not a number
- **THEN** loading the configuration fails with `gates.usageLimitWaitSeconds must be a non-negative integer`
