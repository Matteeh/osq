## ADDED Requirements

### Requirement: Project root check
`osq-kernel-vcs` SHALL offer `project_git_root(root: &Path, config: &Config)`
giving `Result<Option<PathBuf>, NestedRoot>`, the one place Rust osq decides
whether git is on at a project root, as TypeScript's `selectVcs` decides it.
The first matching case gives the result:

1. `config.vcs.enabled` is false: `Ok(None)`, running no git.
2. `GitVcs::new(root)` with `config.timeouts` gives an error or `None` from
   `root()`: `Ok(None)`.
3. That folder equals the root made canonical with `std::fs::canonicalize`,
   or the root as given when that fails: `Ok(Some(<that folder>))`.
4. Otherwise: `Err(NestedRoot { root, top })`, with `root` the canonical
   root and `top` that folder.

`NestedRoot` SHALL implement `std::error::Error` and display
`<root> is inside the git repository at <top> but is not its top level; run osq from <top> or set vcs.enabled to false`,
the message TypeScript's `NestedRootError` carries.

Every feature command that reads or writes git, `approve`, `reject`,
`archive`, `land`, `sync`, `message`, `lint`, `plan`, `report`, `retry`,
`run`, `show`, `inbox` and `doctor`, SHALL call `project_git_root` on its
root right after it loads `osq.toml`, before it reads any change, runs any
other git command or writes any file, and SHALL use its result wherever it
decided before whether git is on. On `NestedRoot` the command SHALL fail with
a `Failed` error for its own name and the `NestedRoot`'s display. This
refusal comes before anything a feature's own requirements say about a root
that is not its repository's top level.

#### Scenario: Project root check outcomes
- **WHEN** `project_git_root` runs on the row's root with a config whose `vcs.enabled` is the row's, where `<outer>` is a fresh repository made with `git init -q -b main` and `<plain>` a fresh folder under `std::env::temp_dir()` that no repository holds
- **THEN** it gives the row's result, where `<outer>` and `<outer>/sub` are written as canonical paths:

| Root | vcs.enabled | Result |
|---|---|---|
| `<plain>` | true | `Ok(None)` |
| `<outer>` | false | `Ok(None)` |
| `<outer>` | true | `Ok(Some(<outer>))` |
| a symbolic link to `<outer>` | true | `Ok(Some(<outer>))` |
| `<outer>/sub` | false | `Ok(None)` |
| `<outer>/sub` | true | `Err` displayed `<outer>/sub is inside the git repository at <outer> but is not its top level; run osq from <outer> or set vcs.enabled to false` |

#### Scenario: Every git command refuses a nested root
- **WHEN** the row's command runs through its feature's `Feature::run` with the row's arguments on the root `<outer>/sub`, where `<outer>` is a fresh repository under `CARGO_TARGET_TMPDIR` made with `git init -q -b main`, with `user.name` `Osq Tester` and `user.email` `tester@example.com`, whose one commit holds `sub/osq.toml` holding `[vcs]\nenabled = true\nauthor = "osq <osq@example.com>"\n`, `sub/openspec/specs/.keep` empty, `sub/openspec/changes/001-alpha/proposal.md` holding `---\ntitle: Alpha\nverify: "true"\n---\n## Goal\n\nAlpha.\n` and `sub/openspec/changes/001-alpha/tasks/1.md` holding `---\ntitle: T\nverify: "true"\nscope:\n  - a.txt\n---\n- [ ] a\n`
- **THEN** it gives a `Failed` error displayed `<command> failed: ` followed by the `NestedRoot` display for `<outer>/sub` and `<outer>`, and `<outer>`'s `git status --porcelain=v1 --untracked-files=all`, `git branch --list`, `git worktree list --porcelain` and its list of files outside `.git` are what they were before the command

| Crate | Command | Arguments |
|---|---|---|
| approve | `approve` | `1` |
| approve | `reject` | `1 --reason x` |
| archive | `archive` | `1` |
| retry | `retry` | `1 1` |
| run | `run` | `1 1` |
| land | `land` | `1` |
| land | `sync` | `1` |
| land | `message` | `1` |
| show | `show` | `1` |
| report | `report` | none |
| inbox | `inbox` | none |
| plan | `plan` | `--next` |
| plan | `plan` | `1` |
| lint | `lint` | `1` |
| doctor | `doctor` | none |
