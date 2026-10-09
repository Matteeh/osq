## ADDED Requirements

### Requirement: Approval notices in the manifest
An approval's `.run/manifest.json` SHALL record `notices`, the approval
digest's notices record `{ items, opened }`, next to `approvalFlags`. A
planning-only manifest SHALL omit it, and an approval whose digest carries no
notices record SHALL omit it too.

#### Scenario: Notices recorded at approval
- **WHEN** `osq approve` seals a change with one red and one grey notice and no opened list
- **THEN** the manifest's `notices.items` lists both with their severity and `folded: false`, and `notices.opened` is null

#### Scenario: Planning manifest
- **WHEN** `osq plan` writes a manifest
- **THEN** it has no `notices`
