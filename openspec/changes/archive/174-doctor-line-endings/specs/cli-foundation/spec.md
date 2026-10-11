# Spec Delta: cli-foundation

## ADDED Requirements

### Requirement: Doctor line endings warning
With `vcs.enabled` and `GitVcs` selected, `osq doctor` SHALL add a passing
`git-line-endings` warning line, after the other version control warnings,
when `vcs.lineEndings()` reports any tracked file whose index line ending is
`crlf` or `mixed`. Files reporting `lf`, `none`, `-text`, or an empty value
SHALL not count. The message SHALL be `<count> tracked file has CRLF or mixed
line endings: <paths>; run git add --renormalize . and commit`, with `files
have` in place of `file has` when the count is not 1. `<paths>` SHALL be the
first `limits.maxListedLineEndings` such files in `git ls-files` order,
joined with `, `, followed by ` and <rest> more` when more files count than
it names. `limits.maxListedLineEndings` SHALL default to 5 and merge from
`osq.config.ts` like the other limits. With `vcs.enabled` off, no
`git-line-endings` line SHALL appear, and the warning SHALL never change
doctor's exit code. osq SHALL never rewrite the files itself.

#### Scenario: Line endings warning text
- **WHEN** doctor runs with `vcs.enabled` and `limits.maxListedLineEndings` 2 in a temporary repository with `core.autocrlf` false whose staged files are as below, besides `lf.txt` with `ok\n` and `bin.dat` with bytes `00 01 0d 0a`
- **THEN** it reports the `git-line-endings` result below:

| Staged files | `git-line-endings` |
|---|---|
| none other | no line |
| `win.txt` with `a\r\nb\r\n` | `1 tracked file has CRLF or mixed line endings: win.txt; run git add --renormalize . and commit` |
| `a.txt` with `a\r\n`, `mix.txt` with `a\nb\r\n` | `2 tracked files have CRLF or mixed line endings: a.txt, mix.txt; run git add --renormalize . and commit` |
| `a.txt`, `b.txt` and `c.txt`, each with `a\r\n` | `3 tracked files have CRLF or mixed line endings: a.txt, b.txt and 1 more; run git add --renormalize . and commit` |

#### Scenario: Line endings with version control off
- **WHEN** doctor runs with `vcs.enabled` off in a repository that has `win.txt` staged with `a\r\nb\r\n`
- **THEN** it prints no `git-line-endings` line

#### Scenario: Line endings warning keeps exit code
- **WHEN** `osq doctor` runs with `vcs.enabled` in an otherwise healthy repository that has `win.txt` staged with `a\r\nb\r\n`
- **THEN** it prints a `[warn] git-line-endings:` line naming `win.txt` and exits 0

#### Scenario: Default listed line endings
- **WHEN** `DEFAULT_CONFIG.limits` is inspected
- **THEN** `maxListedLineEndings` is 5
