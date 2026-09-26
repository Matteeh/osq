## ADDED Requirements

### Requirement: Git read timeout
<!-- source: src/core/foundation/config.ts, src/core/vcs/git-vcs.ts, tests/vcs.test.ts -->
`timeouts.gitSeconds` in `osq.config.ts` SHALL bound each git read osq makes,
and SHALL default to 10 seconds when unset.

#### Scenario: Timeout unset
- **WHEN** `osq.config.ts` sets no `timeouts.gitSeconds`
- **THEN** each git read is bounded by 10 seconds

### Requirement: Doctor git check
<!-- source: src/core/vcs/doctor-git.ts, src/core/foundation/doctor.ts, tests/vcs-doctor.test.ts, tests/doctor.test.ts -->
`osq doctor` SHALL print a `git` line after the `validator` line. It SHALL pass
with git's version when `GitVcs` is selected, and SHALL pass with a warning
that names the reason git checks are off otherwise. When any of `GIT_DIR`,
`GIT_INDEX_FILE` or `GIT_WORK_TREE` is set in osq's environment, doctor SHALL
add a `git-env` line that passes with a warning naming each variable set, and
saying that osq's own git reads ignore them while verify commands and hooks
do not. Neither line SHALL change doctor's exit code.

#### Scenario: Repository root
- **WHEN** doctor runs at the top level of a git repository
- **THEN** it prints `[ok] git:` followed by git's version

#### Scenario: Git absent
- **WHEN** doctor runs and the git binary cannot be found
- **THEN** it prints `[warn] git: git not found; git checks off` and its exit code is unchanged

#### Scenario: GIT_DIR set
- **WHEN** doctor runs with `GIT_DIR` set
- **THEN** it prints a `[warn] git-env:` line naming `GIT_DIR`
