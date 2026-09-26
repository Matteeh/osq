## ADDED Requirements

### Requirement: Version control configuration
<!-- source: src/core/foundation/config-vcs.ts, src/core/foundation/config.ts, tests/vcs-config.test.ts -->
`osq.config.ts` MAY carry a `vcs` block. `enabled` SHALL be a boolean and
default to false. `author`, when set, SHALL have the form `Name <email>`, and
SHALL be required when `enabled` is true. `worktreeRoot` and `prepare`, when
set, SHALL be non-empty strings after trimming, kept trimmed. A loaded config
SHALL always carry `vcs`. `timeouts.gitCommitSeconds` MAY bound each commit
osq makes, and SHALL default to 120 when unset.

#### Scenario: Block unset
- **WHEN** `osq.config.ts` has no `vcs` block
- **THEN** the loaded config carries `vcs: { enabled: false }`

#### Scenario: Enabled without an author
- **WHEN** `osq.config.ts` sets `vcs: { enabled: true }`
- **THEN** loading fails with `vcs.author is required when vcs.enabled is true`

#### Scenario: Malformed author
- **WHEN** `osq.config.ts` sets `vcs: { author: 'osq' }`
- **THEN** loading fails with `vcs.author must look like "Name <email>"`

### Requirement: Doctor version control warnings
<!-- source: src/core/vcs/doctor-git.ts, tests/vcs-doctor-warnings.test.ts -->
With `vcs.enabled` and `GitVcs` selected, `osq doctor` SHALL add a passing
warning line after the `git` line for each of these that holds: `vcs-prepare`
when the project root has `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`,
`bun.lock`, or `bun.lockb` and `vcs.prepare` is unset; `git-hooks` naming each
active commit hook; and `git-signing` when `commit.gpgsign` is true. With
`vcs.enabled` off, none of them SHALL appear, and none SHALL change doctor's
exit code.

#### Scenario: Lockfile without prepare
- **WHEN** doctor runs with `vcs.enabled`, a `pnpm-lock.yaml`, and no `vcs.prepare`
- **THEN** it prints a `[warn] vcs-prepare:` line naming `pnpm-lock.yaml`

#### Scenario: Pre-commit hook
- **WHEN** doctor runs with `vcs.enabled` in a repository with an executable `pre-commit` hook
- **THEN** it prints a `[warn] git-hooks:` line naming `pre-commit`

#### Scenario: Flag off
- **WHEN** doctor runs with `vcs.enabled` off in that same repository
- **THEN** it prints no `vcs-prepare`, `git-hooks`, or `git-signing` line
