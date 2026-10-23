## ADDED Requirements

### Requirement: Setup reads
The `Vcs` trait SHALL hold three more reads, the ones TypeScript's doctor
asks git for, and `GitVcs` SHALL implement them as TypeScript's `GitVcs`
and `probeVersion` do. Each runs through "Git command", is bounded by
`timeouts.git`, and gives an error only as "Git command" says:

```rust
fn version(&self) -> Result<Option<String>, VcsError>;
fn hook_names(&self) -> Result<Vec<String>, VcsError>;
fn line_endings(&self) -> Result<Vec<LineEnding>, VcsError>;
```

- `version()` runs `--version`. It gives `None` when the command fails.
  Otherwise it takes the standard output, or the standard error when the
  output is empty, trims it, and gives its first line, trimmed.
- `hook_names()` runs `rev-parse --git-path hooks`. Its trimmed output
  names the hooks folder, joined to the `GitVcs` root when it is relative.
  It gives the names of the folder's entries that do not end in `.sample`,
  are files after following symlinks, and have any execute bit set, in
  byte order. It gives an empty list when the command fails or the folder
  cannot be read.
- `line_endings()` runs `ls-files --eol -z` and splits the output on NUL.
  It passes over an empty record and a record without a tab. For each
  other record, `path` is the text after the first tab. `index` is the
  text before that tab, from its third character up to its first space,
  or up to the tab when it has no space. The entries keep git's order. It
  gives an empty list when the command fails.

`LineEnding` SHALL be a public struct with the fields `path: String` and
`index: String`, exported from the crate root, and SHALL derive `Debug`,
`Clone`, `PartialEq` and `Eq`.

The tests build their repositories as "Repository state reads" says, with
the same isolated git settings.

#### Scenario: Setup reads of a repository
- **WHEN** the reads run on a repository made with `git init -b main` and `core.autocrlf` set to `false`. It holds one commit of `bin.dat` (the bytes 0, 1 and 2), `crlf.txt` (`a\r\n`), `dir/ü.txt` (`a\n`), `empty.txt` (empty), `lf.txt` (`a\n`) and `mixed.txt` (`a\r\nb\n`). Its `.git/hooks` folder holds `pre-commit` and `commit-msg` with mode 755, `post-commit` with mode 644, `pre-push.sample` with mode 755, and a folder `pre-rebase` with mode 755
- **THEN** each read returns the row's answer, with `<version>` the first line of what `git --version` prints in the scratch folder, trimmed:

| Read | Answer |
|---|---|
| `version()` | `Some(<version>)` |
| `hook_names()` | `commit-msg`, `pre-commit` |
| `line_endings()` | (`bin.dat`, `-text`), (`crlf.txt`, `crlf`), (`dir/ü.txt`, `lf`), (`empty.txt`, `none`), (`lf.txt`, `lf`), (`mixed.txt`, `mixed`) |

#### Scenario: Hooks folder from config
- **WHEN** `hook_names()` runs on a repository made with `git init -b main`, whose `core.hooksPath` is the absolute path of a folder outside it holding `pre-commit` with mode 755 and `notes.txt` with mode 644
- **THEN** it returns `pre-commit`

#### Scenario: Setup reads outside a repository
- **WHEN** the reads run on an empty directory in the scratch folder that no repository holds
- **THEN** `version()` returns `Some(<version>)` as above, and `hook_names()` and `line_endings()` return empty lists

#### Scenario: Setup reads with a program that cannot start
- **WHEN** a `GitVcs` whose program is `osq-missing-git` runs each read below
- **THEN** it returns `VcsError::Spawn` whose `command` is the row's command and whose source's kind is `NotFound`:

| Read | Command |
|---|---|
| `version()` | `osq-missing-git -c core.quotepath=false --version` |
| `hook_names()` | `osq-missing-git -c core.quotepath=false rev-parse --git-path hooks` |
| `line_endings()` | `osq-missing-git -c core.quotepath=false ls-files --eol -z` |
