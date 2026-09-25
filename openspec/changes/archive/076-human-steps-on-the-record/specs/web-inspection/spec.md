# Spec Delta: Web Inspection

## ADDED Requirements

### Requirement: Inbox kind labels
<!-- source: packages/ui/src/home/labels.ts, tests/inbox-next-step.test.ts -->
The dashboard's needs-you group SHALL label `planning` items `needs planning`,
`verification-pending` items `verification pending`, and `verification-failed`
items `verification failed`, as it labels the other kinds.

#### Scenario: Planning label
- **WHEN** `needsYouKindLabel('planning')` is called
- **THEN** it returns `needs planning`
