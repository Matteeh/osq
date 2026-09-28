## ADDED Requirements

### Requirement: Land command
`osq land <id>` SHALL run `landChange` for the id in the current directory,
print each of its lines to stdout, and exit with its code. On a refusal or a
stop it SHALL print only the message to stderr and exit one. `landCommand`
SHALL take injectable `cwd`, `config`, `stdout`, `stderr`, and `exit`, as
`messageCommand` does, and SHALL load `osq.config.ts` inside its error
handling, so a configuration error prints its message and exits one.
`createProgram` SHALL register it through `registerLandCommand`, and the
`doctor` command through `registerDoctorCommand` in `src/cli/doctor.ts`, with
its description and behaviour unchanged.

#### Scenario: Land prints its lines
- **WHEN** `osq land <id>` lands an archived change
- **THEN** stdout holds `Landed <folder> as <commit>`, `Removed leftover draft <path>`, `Removed worktree <path>`, and `Kept branch osq/<folder>`, and the exit code is zero

#### Scenario: Refusal on stderr
- **WHEN** `osq land <id>` refuses
- **THEN** stdout is empty, stderr holds the refusal, and the exit code is one

#### Scenario: Registered commands
- **WHEN** `osq --help` runs
- **THEN** it lists `land <id>` and `doctor`

## MODIFIED Requirements

### Requirement: Message command
`osq message <id>` SHALL print the squash commit message that "Squash
commit message" builds to stdout, exactly and with nothing else, so that
`osq message <id> | git commit -F -` commits it. It SHALL then print
`Branch: osq/<folder>` and `Land: osq land <id>` to stderr, and exit zero.
On a refusal it SHALL print only the refusal to stderr and exit one. It SHALL
write no file and run no git command that writes.

#### Scenario: Landing by hand keeps the trailers
- **WHEN** a change has archived in its worktree and the checkout runs `git merge --squash osq/<folder>` and then commits with `osq message <id>`'s stdout through `git commit -F -`
- **THEN** `git interpret-trailers --parse` over the checkout's HEAD message prints every trailer of "Squash commit message", and `git status` in the worktree is unchanged

#### Scenario: Branch on stderr
- **WHEN** `osq message <id>` succeeds
- **THEN** stderr holds `Branch: osq/<folder>` and `Land: osq land <id>`, and stdout holds only the message

#### Scenario: Refusal
- **WHEN** `osq message <id>` refuses
- **THEN** stdout is empty, stderr holds the refusal, and the exit code is one

### Requirement: osq runs its own changes under version control
osq's own `osq.config.ts` SHALL set `vcs.enabled` to true, `vcs.author` to
`osq <osq@noreply.invalid>`, and `vcs.prepare` to
`pnpm install --frozen-lockfile`. README.md SHALL end its
`## Version control` section with `### Working with version control on`, a
numbered list that says, in order, to approve from the default branch, to
find the worktree from the `Worktree:` line or under `vcs.worktreeRoot`, not
to edit the worktree while a task runs, to land with `osq land <id>`, and,
when landing by hand instead with `git merge --squash osq/<folder>` and
`osq message <id> | git commit -F -`, to remove the leftover draft
`osq status` names.

#### Scenario: Own config
- **WHEN** `loadConfig` reads the repository root
- **THEN** `vcs.enabled` is true, `vcs.author` is `osq <osq@noreply.invalid>`, and `vcs.prepare` is `pnpm install --frozen-lockfile`

#### Scenario: Walkthrough
- **WHEN** README.md is read
- **THEN** `### Working with version control on` follows the other `## Version control` text and holds `osq land <id>` and `osq message <id> | git commit -F -`
