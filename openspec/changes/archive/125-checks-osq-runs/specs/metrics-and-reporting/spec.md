## ADDED Requirements

### Requirement: Report without verification counts
`osq report` SHALL print no `After-landing checks` line and its JSON `history`
SHALL have no `verification` key, whatever the archived changes' events hold.
The `Inbox waiting` section SHALL keep its `verify` kind for wait logs written
before change 125, though the inbox no longer produces `verify` items.

#### Scenario: Archive with recorded outcomes
- **WHEN** an archived change's `archived` event carries `verification` and a later `verification_recorded` event records `passed`
- **THEN** the report text has no `After-landing checks` line and JSON `history` has no `verification` key

## REMOVED Requirements

### Requirement: After-landing verification counts
**Reason**: Nothing is verification pending any more, so a `pending` count would grow with every change that has after-landing notes.
**Migration**: None. `osq show <id>` still prints the verification events an older archive holds.
