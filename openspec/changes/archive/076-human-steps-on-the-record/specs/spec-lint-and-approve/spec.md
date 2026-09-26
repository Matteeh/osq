# Spec Delta: Spec Lint and Approve

## ADDED Requirements

### Requirement: Human steps sections
<!-- source: src/core/spec/human-steps.ts, tests/next-step.test.ts -->
`parseHumanSteps(body)` SHALL split `## Human steps` into `beforeApproval` and
`afterLanding` by its `### Before approval` and `### After landing`
subsections, in any case. Text before the first subsection, or a section with
neither, SHALL be after landing. A part that is empty or `None` SHALL be empty.
`readCheckCommand` SHALL return the trimmed frontmatter `check`, else null.

#### Scenario: Section without subsections
- **WHEN** `## Human steps` holds one line and no subsection
- **THEN** that line is the after-landing text and before approval is empty

#### Scenario: None
- **WHEN** `## Human steps` reads `None`
- **THEN** both parts are empty

### Requirement: Digest steps before approval
<!-- source: src/core/spec/digest.ts, tests/digest-before-approval.test.ts -->
`buildApprovalDigest` SHALL carry `beforeApproval`, the change's steps before
approval. When they are not empty, `formatApprovalDigest` SHALL print `Before
approval, do these first:` and each step line indented by two spaces, right
after the goal. The `Human steps:` block SHALL stay as it is.

#### Scenario: Steps before approval in the digest
- **WHEN** a change's `### Before approval` lists `Create the test database`
- **THEN** the digest prints `Before approval, do these first:` followed by `  Create the test database` before `Tasks:`
