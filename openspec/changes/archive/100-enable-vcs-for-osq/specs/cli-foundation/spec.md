## ADDED Requirements

### Requirement: osq runs its own changes under version control
<!-- source: osq.config.ts, README.md, tests/own-vcs-config.test.ts -->
osq's own `osq.config.ts` SHALL set `vcs.enabled` to true, `vcs.author` to
`osq <osq@noreply.invalid>`, and `vcs.prepare` to
`pnpm install --frozen-lockfile`. README.md SHALL end its
`## Version control` section with `### Working with version control on`, a
numbered list that says, in order, to approve from the default branch, to
find the worktree from the `Worktree:` line or under `vcs.worktreeRoot`, not
to edit the worktree while a task runs, to land with
`git merge --squash osq/<folder>` and `osq message <id> | git commit -F -`,
and to remove the leftover draft `osq status` names.

#### Scenario: Own config
- **WHEN** `loadConfig` reads the repository root
- **THEN** `vcs.enabled` is true, `vcs.author` is `osq <osq@noreply.invalid>`, and `vcs.prepare` is `pnpm install --frozen-lockfile`

#### Scenario: Walkthrough
- **WHEN** README.md is read
- **THEN** `### Working with version control on` follows the other `## Version control` text and holds `osq message <id> | git commit -F -`
