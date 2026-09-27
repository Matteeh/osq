## ADDED Requirements

### Requirement: Message command
<!-- source: src/cli/message.ts, src/cli/index.ts, tests/squash-message.test.ts -->
`osq message <id>` SHALL print the squash commit message that "Squash
commit message" builds to stdout, exactly and with nothing else, so that
`osq message <id> | git commit -F -` commits it. It SHALL then print
`Branch: osq/<folder>` and
`Land: git merge --squash osq/<folder> && osq message <id> | git commit -F -`
to stderr, and exit zero. On a refusal it SHALL print only the refusal to
stderr and exit one. It SHALL write no file and run no git command that
writes.

#### Scenario: Landing by hand keeps the trailers
- **WHEN** a change has archived in its worktree and the checkout runs `git merge --squash osq/<folder>` and then commits with `osq message <id>`'s stdout through `git commit -F -`
- **THEN** `git interpret-trailers --parse` over the checkout's HEAD message prints every trailer of "Squash commit message", and `git status` in the worktree is unchanged

#### Scenario: Branch on stderr
- **WHEN** `osq message <id>` succeeds
- **THEN** stderr holds `Branch: osq/<folder>` and the `Land:` line, and stdout holds only the message

#### Scenario: Refusal
- **WHEN** `osq message <id>` refuses
- **THEN** stdout is empty, stderr holds the refusal, and the exit code is one
