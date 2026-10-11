# Spec Delta: version-control

## ADDED Requirements

### Requirement: Vcs line endings read
The `Vcs` port SHALL also offer `lineEndings()`, a read bounded by
`timeouts.gitSeconds` like every read, that returns one entry per tracked
file, in `git ls-files` order, with the file's `path` relative to the project
root and its `index` line ending: the value `git ls-files --eol` prints after
`i/`, which is `lf`, `crlf`, `mixed`, `none`, `-text`, or empty. `GitVcs`
SHALL read it with `git ls-files --eol -z`, and SHALL return an empty list,
not fail, when git cannot list the files. `NoVcs` SHALL return an empty list.

#### Scenario: Index line endings of a temporary repository
- **WHEN** a temporary repository with `core.autocrlf` false stages only the files below
- **THEN** `lineEndings()` returns exactly these entries, in this order:

| File | Content | Index |
|---|---|---|
| `bin.dat` | bytes `00 01 0d 0a` | `-text` |
| `lf.txt` | `ok\n` | `lf` |
| `mix.txt` | `a\nb\r\n` | `mixed` |
| `win.txt` | `a\r\nb\r\n` | `crlf` |

#### Scenario: Line endings without git
- **WHEN** `NoVcs` is asked for `lineEndings()`
- **THEN** it returns an empty list
