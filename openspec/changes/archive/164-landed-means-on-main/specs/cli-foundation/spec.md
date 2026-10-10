## ADDED Requirements

### Requirement: README names changes waiting to land
README's "Human Attention Inbox" section SHALL say, in its **Needs you**
bullet, that with `vcs.enabled` an archived change the default branch does not
hold yet shows as `archived, not landed` with `osq land <id>`.

#### Scenario: README describes changes waiting to land
- **WHEN** README's "Human Attention Inbox" section is read with whitespace collapsed
- **THEN** its **Needs you** bullet names `vcs.enabled`, `archived, not landed`, and `osq land <id>`
