## MODIFIED Requirements

### Requirement: Inbox kind labels
The dashboard's needs-you group SHALL label `planning` items `needs planning`,
as it labels the other kinds. It SHALL have no label for a verification kind,
because the inbox has none.

#### Scenario: Planning label
- **WHEN** `needsYouKindLabel('planning')` is called
- **THEN** it returns `needs planning`
