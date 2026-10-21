## ADDED Requirements

### Requirement: Land git limits
`land` SHALL build every `GitVcs` it runs, at the root and in a change's
worktree, with `with_timeouts` and the loaded config's `timeouts`, so
`timeouts.gitSeconds` bounds each git read and `timeouts.gitCommitSeconds`
each commit and merge. A git command that runs out of time SHALL fail with
its `VcsError::TimedOut` display, `<command> timed out after <limit>`, as
"Land settings" says for every `VcsError`, and the checkout's HEAD SHALL stay
unchanged.

#### Scenario: A slow git status stops land at the configured limit
- **WHEN** `land` runs with the id `1` on a land repository holding the fixture change, whose `osq.toml` adds `[timeouts]\ngitSeconds = 1\n`, with `extensions.worktreeConfig` set to `true` and `core.fsmonitor` set to `sleep 30` in the row's worktree config
- **THEN** within 5 seconds it gives a `Failed` error for the command `land` with the message `git -c core.quotepath=false status --porcelain=v1 -z --untracked-files=all timed out after 1s`, and the checkout's HEAD is unchanged:

| Worktree config | Status that runs out of time |
|---|---|
| the change's worktree | the change worktree's status, read before the commit |
| the checkout | the checkout's status, read by the fast-forward |
