## MODIFIED Requirements

### Requirement: Inbox kind labels
The dashboard's needs-you group SHALL label `planning` items `needs planning`,
as it labels the other kinds, `change-archived` items `not landed`, and
`after-land-failed` items `after-land failed`. It
SHALL have no label for a verification kind, because the inbox has none.

#### Scenario: Planning label
- **WHEN** `needsYouKindLabel('planning')` is called
- **THEN** it returns `needs planning`

#### Scenario: Not landed label
- **WHEN** `needsYouKindLabel('change-archived')` is called
- **THEN** it returns `not landed`

#### Scenario: After-land failed label
- **WHEN** `needsYouKindLabel('after-land-failed')` is called
- **THEN** it returns `after-land failed`
