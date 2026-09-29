## ADDED Requirements

### Requirement: Land message command
`osq message <id>` SHALL print the commit message that "Squash commit
message" builds to stdout, exactly and with nothing else. It is the message
`osq land <id>` commits. It SHALL then print `Branch: osq/<folder>` to stderr,
and nothing else there, and exit zero. On a refusal it SHALL print only the
refusal to stderr and exit one. It SHALL write no file and run no git command
that writes.

#### Scenario: Message is the land commit's message
- **WHEN** a change has archived in its worktree, `osq message <id>` prints its message, and `osq land <id>` then lands the change
- **THEN** the land commit's message equals that stdout, and `git interpret-trailers --parse` over it prints every trailer of "Squash commit message"

#### Scenario: Branch on stderr
- **WHEN** `osq message <id>` succeeds
- **THEN** stderr is exactly `Branch: osq/<folder>` and a newline, and stdout holds only the message

#### Scenario: Refusal
- **WHEN** `osq message <id>` refuses
- **THEN** stdout is empty, stderr holds the refusal, and the exit code is one

## MODIFIED Requirements

### Requirement: Land command
`osq land <id>` SHALL run `landChange` for the id in the current directory,
print each of its lines to stdout, and exit with its code. It SHALL pass
`landChange` a progress callback that prints each progress line to stderr, so
stdout holds only the land's result. On a refusal or a stop it SHALL print
only the message to stderr and exit one. `landCommand` SHALL take injectable
`cwd`, `config`, `stdout`, `stderr`, and `exit`, as `messageCommand` does, and
SHALL load `osq.config.ts` inside its error handling, so a configuration error
prints its message and exits one. `createProgram` SHALL register it through
`registerLandCommand`, and the `doctor` command through
`registerDoctorCommand` in `src/cli/doctor.ts`, with its description and
behaviour unchanged.

#### Scenario: Land prints its lines
- **WHEN** `osq land <id>` lands an archived change
- **THEN** stdout holds `Landed <folder> as <commit>`, `Removed leftover draft <path>`, `Removed worktree <path>`, and `Kept branch osq/<folder>`, and the exit code is zero

#### Scenario: Refusal on stderr
- **WHEN** `osq land <id>` refuses
- **THEN** stdout is empty, stderr holds the refusal, and the exit code is one

#### Scenario: Registered commands
- **WHEN** `osq --help` runs
- **THEN** it lists `land <id>` and `doctor`

#### Scenario: Progress on stderr
- **WHEN** `osq land <id>` syncs because the default branch moved
- **THEN** the sync's progress line is on stderr, and stdout holds only the land's result lines

### Requirement: osq runs its own changes under version control
osq's own `osq.config.ts` SHALL set `vcs.enabled` to true, `vcs.author` to
`osq <osq@noreply.invalid>`, and `vcs.prepare` to
`pnpm install --frozen-lockfile`. README.md SHALL end its
`## Version control` section with `### Working with version control on`, a
numbered list that says, in order, to approve from the default branch, to
find the worktree from the `Worktree:` line or under `vcs.worktreeRoot`, not
to edit the worktree while a task runs, and to land with `osq land <id>`,
which lands the change completely or changes nothing. The `## Version control`
section SHALL describe no way to land by hand.

#### Scenario: Own config
- **WHEN** `loadConfig` reads the repository root
- **THEN** `vcs.enabled` is true, `vcs.author` is `osq <osq@noreply.invalid>`, and `vcs.prepare` is `pnpm install --frozen-lockfile`

#### Scenario: Walkthrough
- **WHEN** README.md is read
- **THEN** `### Working with version control on` follows the other `## Version control` text and holds `osq land <id>`, and the `## Version control` section holds neither `git merge --squash` nor `| git commit -F -`

## REMOVED Requirements

### Requirement: Message command
**Reason**: It described `osq message` as the hand-landing tool, with a `Land:` line on stderr. ADR 006 retires hand landing.
**Migration**: See "Land message command". `osq message <id>` keeps printing the message on stdout.
