## ADDED Requirements

### Requirement: Commit catch-up gate key
Public configuration SHALL contain `gates.commitRetries`, defaulting to 2: the
catch-ups the watcher tries after a `commit_failed` halt before a human must
run `osq retry <id> change`. It SHALL be a non-negative integer, `0` turns the
catch-up after a halt off, a partial gates block SHALL keep its default, and
any other value SHALL be rejected with `gates.commitRetries must be a
non-negative integer`. A config whose `gates` object lacks the key, such as
one built in a test, SHALL behave as the default.

#### Scenario: Default
- **WHEN** configuration declares no `gates` block, or one without `commitRetries`
- **THEN** `gates.commitRetries` is 2

#### Scenario: Invalid value
- **WHEN** `gates.commitRetries` is negative, fractional, or not a number
- **THEN** loading the configuration fails with `gates.commitRetries must be a non-negative integer`
