## MODIFIED Requirements

### Requirement: Version control configuration
<!-- source: src/core/foundation/config-vcs.ts, src/core/foundation/config.ts, tests/vcs-config.test.ts, tests/vcs-worktree-setup.test.ts -->
`osq.config.ts` MAY carry a `vcs` block. `enabled` SHALL be a boolean and
default to false. `author`, when set, SHALL have the form `Name <email>`, and
SHALL be required when `enabled` is true. `worktreeRoot`, `prepare`, and
`defaultBranch`, when set, SHALL be non-empty strings after trimming, kept
trimmed. A loaded config SHALL always carry `vcs`. `timeouts.gitCommitSeconds`
MAY bound each commit osq makes, and SHALL default to 120 when unset.

#### Scenario: Block unset
- **WHEN** `osq.config.ts` has no `vcs` block
- **THEN** the loaded config carries `vcs: { enabled: false }`

#### Scenario: Enabled without an author
- **WHEN** `osq.config.ts` sets `vcs: { enabled: true }`
- **THEN** loading fails with `vcs.author is required when vcs.enabled is true`

#### Scenario: Malformed author
- **WHEN** `osq.config.ts` sets `vcs: { author: 'osq' }`
- **THEN** loading fails with `vcs.author must look like "Name <email>"`

#### Scenario: Default branch trimmed
- **WHEN** `osq.config.ts` sets `vcs: { defaultBranch: ' trunk ' }`
- **THEN** the loaded config carries `defaultBranch: 'trunk'`, and a blank `defaultBranch` fails with `vcs.defaultBranch must be a non-empty string if provided`
