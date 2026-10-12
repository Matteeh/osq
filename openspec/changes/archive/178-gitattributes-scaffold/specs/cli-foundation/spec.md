# Spec Delta: cli-foundation

## ADDED Requirements

### Requirement: Gitattributes line endings block
`osq init` SHALL keep one managed block in the project root's
`.gitattributes`: the three lines `# OSQ:GITATTRIBUTES:START`, `* text=auto`,
and `# OSQ:GITATTRIBUTES:END`, joined with `\n`. A block is the text from the
first `# OSQ:GITATTRIBUTES:START` to the first `# OSQ:GITATTRIBUTES:END` after
it. When the file is missing or empty, init SHALL write the block and a
trailing `\n`. When the file has no block, init SHALL put the block, `\n\n`,
and then the file's previous content at the top, because later lines win in
git and the project's own rules must override it. When the file has a block
whose text differs, init SHALL replace that text in place and leave every
other byte alone. When the file already has the current block, wherever it
sits, init SHALL leave the file untouched. Init SHALL print
`  updated  .gitattributes (line endings)` when it wrote the file, and nothing
about `.gitattributes` otherwise. osq SHALL never run git to renormalize or
commit files.

#### Scenario: Gitattributes block written by init
- **WHEN** `osq init` runs in a project whose `.gitattributes` is as below, where `B` stands for the current block `# OSQ:GITATTRIBUTES:START\n* text=auto\n# OSQ:GITATTRIBUTES:END`
- **THEN** `.gitattributes` holds the content below afterwards, and init prints `  updated  .gitattributes (line endings)` exactly when the Updated column says yes:

| `.gitattributes` before | `.gitattributes` after | Updated |
|---|---|---|
| missing | `B\n` | yes |
| empty | `B\n` | yes |
| `*.png binary\n` | `B\n\n*.png binary\n` | yes |
| `*.png binary\n# OSQ:GITATTRIBUTES:START\n* text=auto eol=lf\n# OSQ:GITATTRIBUTES:END\n*.md text\n` | `*.png binary\nB\n*.md text\n` | yes |
| `B\n\n*.png binary\n` | `B\n\n*.png binary\n` | no |
| `*.png binary\nB\n` | `*.png binary\nB\n` | no |

#### Scenario: Gitattributes block on a second init
- **WHEN** `osq init` runs twice in a project with no `.gitattributes`
- **THEN** the second run leaves `.gitattributes` as `B\n` and prints no `.gitattributes` line

### Requirement: Doctor gitattributes warning
With `vcs.enabled` and `GitVcs` selected, `osq doctor` SHALL add a passing
`gitattributes` warning line, after the `git-signing` check and before the
`git-line-endings` check, when the project root's `.gitattributes` is missing
or does not contain the current block that "Gitattributes line endings block"
defines. The message SHALL be `.gitattributes has no current osq line
endings block; run osq init`. With `vcs.enabled` off, no `gitattributes` line
SHALL appear, and the warning SHALL never change doctor's exit code.

#### Scenario: Gitattributes warning text
- **WHEN** doctor runs with `vcs.enabled` in a temporary repository whose `.gitattributes` is as below, with `B` as in "Gitattributes block written by init"
- **THEN** it reports the `gitattributes` result below:

| `.gitattributes` | `gitattributes` |
|---|---|
| missing | `.gitattributes has no current osq line endings block; run osq init` |
| `*.png binary\n` | `.gitattributes has no current osq line endings block; run osq init` |
| `# OSQ:GITATTRIBUTES:START\n* text=auto eol=lf\n# OSQ:GITATTRIBUTES:END\n` | `.gitattributes has no current osq line endings block; run osq init` |
| `B\n` | no line |
| `*.png binary\nB\n` | no line |

#### Scenario: Gitattributes with version control off
- **WHEN** doctor runs with `vcs.enabled` off in a repository with no `.gitattributes`
- **THEN** it prints no `gitattributes` line

#### Scenario: Gitattributes warning keeps exit code
- **WHEN** `osq doctor` runs with `vcs.enabled` in an otherwise healthy repository with no `.gitattributes`
- **THEN** it prints a `[warn] gitattributes:` line naming `osq init` and exits 0
