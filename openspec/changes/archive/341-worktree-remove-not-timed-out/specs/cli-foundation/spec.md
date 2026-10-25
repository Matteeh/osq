# Spec Delta: cli-foundation

## MODIFIED Requirements

### Requirement: Version control configuration
`osq.config.ts` MAY carry a `vcs` block. `enabled` SHALL be a boolean and
default to false. `author`, when set, SHALL have the form `Name <email>`, and
SHALL be required when `enabled` is true. `worktreeRoot`, `prepare`, and
`defaultBranch`, when set, SHALL be non-empty strings after trimming, kept
trimmed. A loaded config SHALL always carry `vcs`. `timeouts.gitCommitSeconds`
MAY bound each commit osq makes, and SHALL default to 120 when unset.
`timeouts.gitWorktreeRemoveSeconds` MAY bound each `git worktree remove` osq
runs, and SHALL default to 1800 from `DEFAULT_GIT_WORKTREE_REMOVE_SECONDS` in
`src/core/foundation/config-vcs.ts` when unset, long enough to delete a
worktree holding a multi-gigabyte build folder.

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
