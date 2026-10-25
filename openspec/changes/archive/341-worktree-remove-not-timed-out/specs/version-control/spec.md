# Spec Delta: version-control

## ADDED Requirements

### Requirement: Worktree removal time limit
`GitVcs.worktreeRemove` SHALL run `git worktree remove <path>` bounded by
`timeouts.gitWorktreeRemoveSeconds`, or by
`DEFAULT_GIT_WORKTREE_REMOVE_SECONDS` when that key is unset, and never by
`timeouts.gitSeconds`, so removing a worktree that holds a large build folder
is not cut off halfway. At that limit it SHALL fail as "Git timeout message"
says. Every other git command keeps its own bound.

#### Scenario: Worktree removal under its own limit
- **WHEN** `worktreeRemove` runs on a linked worktree with a git binary that sleeps 1 second on `worktree remove` and then runs it, and the timeouts below
- **THEN** it does what the row says:

| `gitSeconds` | `gitWorktreeRemoveSeconds` | Outcome |
|---|---|---|
| `0.1` | unset | the worktree is removed |
| `0.1` | `5` | the worktree is removed |
| unset | `0.1` | it fails with an error whose message holds `git worktree remove <path> timed out after 0.1s` |
