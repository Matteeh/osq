## MODIFIED Requirements

### Requirement: Doctor git checks
After its change lines, `doctor` SHALL print the git lines TypeScript's
`checkGit` prints. None of them fails. Each is `[ok]` or `[warn]`, so
none changes whether `doctor` fails.

Before any line, when `osq.toml` loads, `doctor` SHALL call rust-vcs
`project_git_root` on the root and fail with the `NestedRoot`'s display
when it gives one, as rust-vcs "Project root check" says and as
TypeScript's doctor fails on a `NestedRootError`. So case 3 below prints
only with `vcs.enabled` off.

`doctor` asks a `GitVcs` on the root, with the config's timeouts, through
rust-vcs's reads. The first matching case gives the `git` line:

1. `version()` gives an error or `None`: `[warn] git: git not found; git checks off`.
2. `root()` gives an error or `None`: `[warn] git: not a git repository; git checks off`.
3. `root()` differs from the root's real path, from `std::fs::canonicalize` or the root as given when that fails: `[warn] git: not the repository root; git checks off`.
4. Otherwise: `[ok] git: <the version>`.

Only in case 4 and with `vcs.enabled`, these warnings follow, each only
when it applies, in this order:

1. `vcs-prepare`: when `vcs.prepare` is unset, the lockfiles that exist at the root, in the order `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lock` and `bun.lockb`. With any, it is `[warn] vcs-prepare: <lockfiles joined by ", "> found without vcs.prepare; set vcs.prepare to the install command`.
2. `git-hooks`: the names `hook_names()` gives that are `pre-commit`, `prepare-commit-msg`, `commit-msg` or `post-commit`, in its order. With any, it is `[warn] git-hooks: active commit hooks: <names joined by ", ">; check each runs unattended and leaves the tree as verified`. A read error counts as no hooks.
3. `git-signing`: when `config_value("commit.gpgsign")`, lowercased, is `true`, `1`, `yes` or `on`, it is `[warn] git-signing: commit.gpgsign is true; check signing runs without a prompt`. A read error counts as unset.
4. `gitattributes`: when the root's `.gitattributes` cannot be read as text or does not contain `# OSQ:GITATTRIBUTES:START\n* text=auto\n# OSQ:GITATTRIBUTES:END`, it is `[warn] gitattributes: .gitattributes has no current osq line endings block; run osq init`.
5. `git-line-endings`: the entries of `line_endings()` whose index is `crlf` or `mixed`, in its order. With a count of them, the first `limits.maxListedLineEndings` of their paths joined by `, ` are the names. When more are left than are named, ` and <the number left> more` follows the names. The line is `[warn] git-line-endings: <count> tracked file has CRLF or mixed line endings: <names>; run git add --renormalize . and commit` for one, and the same with `tracked files have` for more than one. A read error counts as no entries.

Last, whatever the cases above, comes `git-env`. It names the variables
among `GIT_DIR`, `GIT_INDEX_FILE` and `GIT_WORK_TREE`, in that order, that
are set to a non-empty value in the process environment. With one it is
`[warn] git-env: <name> is set; osq's own git reads ignore it while verify commands and hooks do not`.
With more it is
`[warn] git-env: <names joined by " and "> are set; osq's own git reads ignore them while verify commands and hooks do not`.

The git scenarios run `doctor` in a child process of the test binary, as
the show feature's land tests run theirs. The child's environment sets
`GIT_CONFIG_GLOBAL` to `/dev/null`, `GIT_CONFIG_NOSYSTEM` to `1` and
`GIT_CEILING_DIRECTORIES` to the scratch folder, together with the row's
variables. The test builds each repository with the same three settings,
and each root holds the managed files that "Doctor managed blocks" names.

#### Scenario: Doctor git lines
- **WHEN** `doctor` runs with no arguments in the child, on the row's root with the row's `osq.toml` and the row's setup. `<git>` stands for `[ok] git: ` followed by the first line of what `git --version` prints, trimmed. `<vcs>` stands for `[vcs]\nenabled = true\nauthor = "osq <osq@example.com>"`. A repository is made with `git init -b main` and `core.autocrlf` set to `false`, and its listed files are committed
- **THEN** doctor returns an output, and its lines after `[ok] done-markers: all done markers verified` are exactly the row's lines:

| Root | osq.toml | Setup | Lines |
|---|---|---|---|
| a folder no repository holds | none | none | `[warn] git: not a git repository; git checks off` |
| the folder `sub` of a repository | none | none | `[warn] git: not the repository root; git checks off` |
| a folder no repository holds | none | the child's `PATH` set to an empty folder | `[warn] git: git not found; git checks off` |
| a repository | none | `pnpm-lock.yaml` `x`, an executable `.git/hooks/pre-commit`, `commit.gpgsign` `true`, `c.txt` `a\r\n` committed | `<git>` |
| a repository | `<vcs>\n\n[limits]\nmaxListedLineEndings = 6` | `pnpm-lock.yaml` `x` and `yarn.lock` `x`; executable `.git/hooks/pre-commit`, `.git/hooks/commit-msg` and `.git/hooks/pre-push`, and a `.git/hooks/post-commit` with mode 644; `commit.gpgsign` `On`; no `.gitattributes`; `c1.txt` to `c7.txt`, each `a\r\n`, committed | `<git>`, `[warn] vcs-prepare: pnpm-lock.yaml, yarn.lock found without vcs.prepare; set vcs.prepare to the install command`, `[warn] git-hooks: active commit hooks: commit-msg, pre-commit; check each runs unattended and leaves the tree as verified`, `[warn] git-signing: commit.gpgsign is true; check signing runs without a prompt`, `[warn] gitattributes: .gitattributes has no current osq line endings block; run osq init`, `[warn] git-line-endings: 7 tracked files have CRLF or mixed line endings: c1.txt, c2.txt, c3.txt, c4.txt, c5.txt, c6.txt and 1 more; run git add --renormalize . and commit` |
| a repository | `<vcs>\nprepare = "pnpm install"` | `pnpm-lock.yaml` `x`; `commit.gpgsign` `false`; `l.txt` `a\n` and `m.txt` `a\r\nb\n` committed, then `.gitattributes` `# keep\n# OSQ:GITATTRIBUTES:START\n* text=auto\n# OSQ:GITATTRIBUTES:END\n` written | `<git>`, `[warn] git-line-endings: 1 tracked file has CRLF or mixed line endings: m.txt; run git add --renormalize . and commit` |
| a repository | `<vcs>` | `.gitattributes` `# OSQ:GITATTRIBUTES:START\n* text=auto\n# OSQ:GITATTRIBUTES:END\n` and `l.txt` `a\n` committed | `<git>` |

#### Scenario: Doctor git environment
- **WHEN** `doctor` runs with no arguments in the child on a folder no repository holds, with no `osq.toml`, the managed files, and the row's variables added to the child's environment
- **THEN** doctor returns an output, and its lines after `[ok] done-markers: all done markers verified` are exactly the row's lines:

| Variables | Lines |
|---|---|
| `GIT_DIR` `/nowhere` | `[warn] git: not a git repository; git checks off`, `[warn] git-env: GIT_DIR is set; osq's own git reads ignore it while verify commands and hooks do not` |
| `GIT_DIR` empty, `GIT_INDEX_FILE` `x`, `GIT_WORK_TREE` `y` | `[warn] git: not a git repository; git checks off`, `[warn] git-env: GIT_INDEX_FILE and GIT_WORK_TREE are set; osq's own git reads ignore them while verify commands and hooks do not` |
