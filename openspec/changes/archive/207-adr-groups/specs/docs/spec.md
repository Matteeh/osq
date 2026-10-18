# Spec Delta: docs

## MODIFIED Requirements

### Requirement: ADR page model
`buildAdrPages(projectRoot, config)` SHALL return one page per ADR
`readDecisions` reads, in number order, each with `number`, `title`,
`status`, `date`, `path`, `rule`, `appliesTo` and `supersededBy` as
`readDecisions` reads them; `capabilities`, every living capability name in
order when `appliesTo` is `all`, the capabilities its `governs` holds when it
lists some, group members included, and empty otherwise; and `body`, the
file's text after its frontmatter with its first `# ` heading line removed,
trimmed.

#### Scenario: ADR pages of the docs fixture
- **WHEN** the ADR pages are built for the docs fixture
- **THEN** they hold the values below:

| ADR | Field | Value |
|---|---|---|
| `001` | `title` | `Money in Integer Cents` |
| `001` | `capabilities` | `pricing` |
| `001` | `body` starts with | `Date: 2026-09-20` |
| `002` | `capabilities` | `invoices`, `pricing` |
| `003` | `status` | `superseded` |
| `003` | `supersededBy` | `004` |

#### Scenario: ADR page of a group ADR
- **WHEN** living `pricing` and `invoices` have sidecar group `sales` and an accepted ADR applies to `[group:sales]`
- **THEN** its page has `appliesTo` `["group:sales"]` and `capabilities` `invoices`, `pricing`
