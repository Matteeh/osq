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
- **THEN** stdout holds `Landed <folder> as <commit>`, `Removed worktree <path>`, and `Kept branch osq/<folder>`, in that order and nothing else, and the exit code is zero

#### Scenario: Refusal on stderr
- **WHEN** `osq land <id>` refuses
- **THEN** stdout is empty, stderr holds the refusal, and the exit code is one

#### Scenario: Registered commands
- **WHEN** `osq --help` runs
- **THEN** it lists `land <id>` and `doctor`

#### Scenario: Progress on stderr
- **WHEN** `osq land <id>` syncs because the default branch moved
- **THEN** the sync's progress line is on stderr, and stdout holds only the land's result lines

## ADDED Requirements

### Requirement: Change numbers across trees
`src/core/foundation/change-number.ts` SHALL export `getNextSpecNumber`,
unchanged from `new.ts`, which still re-exports it, and
`knownChangeFolders(projectRoot, config)`. `knownChangeFolders` SHALL return
the folder name of every change `listChanges` returns, active, archived, and
rejected, and, with `vcs.enabled` and `GitVcs` selected, the name of every
branch `listBranches('osq/')` lists, without its `osq/` prefix and without a
trailing `-rejected-<n>`. `createNewSpec` SHALL take an optional `config`.
With it, the new change's number SHALL be one more than the highest numeric
prefix among the folders `getNextSpecNumber` scans and the folders
`knownChangeFolders` returns, zero-padded to three digits. Without it, the
number SHALL be what `getNextSpecNumber` returns. `osq new` SHALL load the
project's config and pass it, and `osq plan` SHALL pass the config it loaded,
for a queue item and for a named change alike.

#### Scenario: Running change keeps its number
- **WHEN** `vcs.enabled` is on, the checkout holds only archived `001-a` and `002-b`, and `003-c` runs in its worktree
- **THEN** `osq new next` creates `004-next`

#### Scenario: Stacked change keeps its number
- **WHEN** the checkout holds no `004-d` and the stacked approval directory holds `004-d`
- **THEN** the next change created is `005-<slug>`

#### Scenario: Rejected branch keeps its number
- **WHEN** no tree holds `006-f`, and branches `osq/006-f` and `osq/006-f-rejected-1` exist
- **THEN** the next change created is `007-<slug>`, and `knownChangeFolders` lists `006-f` for both branches

#### Scenario: Version control off
- **WHEN** `vcs.enabled` is off and the checkout holds active `001-a` and archived `002-b`
- **THEN** the next change created is `003-<slug>`, and no git command runs

## REMOVED Requirements

### Requirement: Manual task completion command
**Reason**: `osq done` marked a task done without its `verify`, a claim osq cannot check. ADR 006 decision 3 removes it.
**Migration**: None needed for history: a done marker with `manual: true` in an archive still reads as manual. To finish a task, fix the cause and run `osq retry <id> <n>`, or reject the change and plan it again.
