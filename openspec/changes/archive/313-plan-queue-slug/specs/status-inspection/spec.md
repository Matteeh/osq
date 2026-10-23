## MODIFIED Requirements

### Requirement: Queue module boundaries
Queue parsing, filesystem association and state projection, planning selection
and spend, and report-only queue derivation SHALL live in cohesive modules that
pass the repository source-line budget. `src/core/queue.ts` SHALL remain the
stable public facade for the established queue API. Choosing the queue row to
plan, the first eligible one or the one a slug names, SHALL live in its own
module beside the planning module, which calls it.

The decomposition SHALL preserve queue behavior and types, keep report-only
derivation outside the parsing, state, and planning modules, and SHALL NOT add
queue modules to the source-line allow list.

#### Scenario: Queue modules remain bounded
- **WHEN** queue planning or reporting responsibilities are added
- **THEN** the source-line budget and queue regression tests pass through the stable queue entrypoints without a new allow-list entry
