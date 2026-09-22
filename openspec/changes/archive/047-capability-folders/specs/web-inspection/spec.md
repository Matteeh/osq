# Spec Delta: Web Inspection

## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: src/core/web/**, packages/ui/**, tests/serve*.test.ts, tests/web*.test.ts, tests/ui*.test.ts, tests/fixtures/web/** -->
The Web Inspection capability SHALL own read-only web document composition,
HTTP routing and static delivery, SSE invalidation, the browser application,
and their focused fixtures and tests. CLI command registration, public
configuration, root workspace packaging, and release smoke coverage SHALL
remain owned by CLI Foundation. Existing report, inbox, show, parser, scope,
state, and planning modules SHALL remain authoritative for their established
contracts and SHALL not depend on Web Inspection.

#### Scenario: Codebase ownership boundaries
- **WHEN** ownership is resolved for dashboard core or browser files
- **THEN** `src/core/web/**`, `packages/ui/**`, focused web tests, and web fixtures map to web-inspection while existing core capabilities retain their dependency direction
