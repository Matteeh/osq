## MODIFIED Requirements

### Requirement: Language presets and coverage
`LANGUAGE_PRESETS` SHALL list each language osq knows, as data, in this
order, with its manifests, lock files, extensions, test folders and verify
runners. A test folder is a folder beside a manifest of that language whose
files are all tests. A verify runner is a binary and the subcommands of it
that a task verify may start with:

| language | manifests | lock files | extensions | test folders | verify runners |
| --- | --- | --- | --- | --- | --- |
| TypeScript/JavaScript | `package.json` | `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` | `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs` | (none) | (none) |
| Rust | `Cargo.toml` | `Cargo.lock` | `.rs` | `tests`, `benches` | `cargo` with `test`, `nextest`, `build`, `check`, `clippy`, `fmt`, `run` |
| Python | `pyproject.toml` | `poetry.lock`, `uv.lock` | `.py` | (none) | (none) |
| Go | `go.mod` | `go.sum` | `.go` | (none) | (none) |

`verifyRunners(languages)` SHALL return the verify runners of the presets
whose names are in `languages`, in preset order.

`LANGUAGE_COVERAGE` SHALL be the one list of which languages each gate and
extra covers, and a change that makes one cover another language SHALL update
it. It is, in this order:

| name | kind | covers |
| --- | --- | --- |
| test-modification gate | gate | TypeScript/JavaScript, Rust |
| denied-dependency gate | gate | TypeScript/JavaScript |
| verify-command lint | extra | TypeScript/JavaScript, Rust |
| test output reading | extra | TypeScript/JavaScript |
| import graph | extra | TypeScript/JavaScript |
| traceability | extra | TypeScript/JavaScript |
| function ranges | extra | TypeScript/JavaScript |
| repository measures | extra | TypeScript/JavaScript |

`uncoveredBy(language)` SHALL return the names of the gates and of the extras
that do not cover `language`, each in list order.

#### Scenario: Gates and extras a language lacks
- **WHEN** `uncoveredBy` reads the language in the row
- **THEN** it returns the row's gates and extras

| language | gates | extras |
| --- | --- | --- |
| Rust | denied-dependency gate | test output reading, import graph, traceability, function ranges, repository measures |
| TypeScript/JavaScript | (none) | (none) |

#### Scenario: Verify runners of the languages
- **WHEN** `verifyRunners` reads the languages in the row
- **THEN** it returns the row's runners

| languages | runners |
| --- | --- |
| Rust | `cargo` with `test`, `nextest`, `build`, `check`, `clippy`, `fmt`, `run` |
| TypeScript/JavaScript, Rust | `cargo` with `test`, `nextest`, `build`, `check`, `clippy`, `fmt`, `run` |
| TypeScript/JavaScript | (none) |
| (none) | (none) |
