## MODIFIED Requirements

### Requirement: Vcs selection
The system SHALL select `GitVcs` only when the git binary runs and the project
root, with symbolic links resolved, is the top level of a git repository.
Otherwise it SHALL select `NoVcs` with one of the reasons `git not found`,
`not a git repository`, or `not the repository root`, except that when
`vcs.enabled` is true and the project root is inside a repository but not its
top level, selection SHALL instead throw a `NestedRootError` with the message
`<root> is inside the git repository at <top> but is not its top level; run osq from <top> or set vcs.enabled to false`,
where `<root>` is the project root and `<top>` the repository's top level,
both with symbolic links resolved. The watcher and doctor SHALL select through
this one function, so every command that reads or writes git with
`vcs.enabled` on fails with that message before it writes anything.

#### Scenario: Folder below the root
- **WHEN** the project root is a folder inside a repository but not its top level
- **THEN** selection returns `NoVcs` with reason `not the repository root`

#### Scenario: Plain folder
- **WHEN** the project root is a temporary folder outside any repository
- **THEN** selection returns `NoVcs` with reason `not a git repository`

#### Scenario: Folder below the root with git on
- **WHEN** selection runs with a config whose `vcs` sets `enabled` true and `author` `osq <osq@example.com>`, on the folder `<outer>/sub` of a temporary repository `<outer>`
- **THEN** it rejects with a `NestedRootError` whose message is `<outer>/sub is inside the git repository at <outer> but is not its top level; run osq from <outer> or set vcs.enabled to false`, with `<outer>` written as its real path

#### Scenario: Commands below the root with git on
- **WHEN** the row's command runs through `runCli` with the folder `<outer>/sub` as its working directory, where `<outer>` is a temporary repository on the branch `main` whose one commit holds `sub/osq.config.ts` holding `export default { harness: 'mock', vcs: { enabled: true, author: 'osq <osq@example.com>' } };`, `sub/openspec/specs/`, `sub/openspec/changes/001-alpha/proposal.md` holding `---\ntitle: Alpha\nverify: node verify.cjs\n---\n## Goal\n\nAlpha.\n` and `sub/openspec/changes/001-alpha/tasks/1.md` holding `---\ntitle: T\nverify: node verify.cjs\nscope:\n  - a.txt\n---\n- [ ] a\n`
- **THEN** the exit code is 1, stderr holds the message of "Folder below the root with git on", and `<outer>`'s `git status --porcelain=v1 --untracked-files=all`, `git branch --list`, `git worktree list --porcelain` and its list of files outside `.git` are what they were before the command

| Command |
|---|
| `approve 1` |
| `reject 1 --reason x` |
| `land 1` |
| `retry 1 1` |
| `show 1` |
| `status` |
| `report` |
| `inbox` |
| `lint 1` |
| `doctor` |
| `plan --next` |
