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
| denied-dependency gate | gate | TypeScript/JavaScript, Rust |
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
| Rust | (none) | test output reading, import graph, traceability, function ranges, repository measures |
| Python | test-modification gate, denied-dependency gate | verify-command lint, test output reading, import graph, traceability, function ranges, repository measures |
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

## ADDED Requirements

### Requirement: Manifest dependencies
The adapter of `languageAdapter(language)` SHALL have `manifestDependencies`:
null for every language but Rust, and for Rust a function that reads the text
of a `Cargo.toml` and returns either `{ ok: true, names }`, the sorted
distinct crate names it declares, or `{ ok: false, error }`, where `error`
starts `line <n>: ` with the 1-based line where reading stopped. It SHALL use
osq's own reader and no new dependency.

The reader SHALL read the TOML that manifests use: blank lines, `#` comments,
`[table]` and `[[array of tables]]` headers, and `key = value` lines, where a
key is bare (`A-Za-z0-9_-`) or quoted and may be dotted. A value is a basic,
literal or multi-line string, an array (which may span lines and hold
comments and a trailing comma), an inline table, or a bare scalar such as a
number, boolean or date. Header-like text inside a string SHALL not count.
Anything else, such as an unterminated string, an unclosed inline table or
header, a key without `=`, or text after a value, SHALL give
`{ ok: false }`, never a guess.

A dependency table is the key path `dependencies`, `dev-dependencies`,
`build-dependencies`, `dev_dependencies` or `build_dependencies`, either
alone, after `workspace` (only `workspace.dependencies`), or after
`target.<platform>`. Each key that comes right after a dependency table in a
full key path, made from the table header and the line's dotted keys, or a
header naming one such as `[dependencies.tokio]`, declares a crate. Its name
is the key, or the string under its `package` key when it has one.

#### Scenario: Crates a manifest declares
- **WHEN** the Rust adapter's `manifestDependencies` reads the manifest in the row, written with `\n` for each line break
- **THEN** it returns the row's names, or `ok: false` with an error that starts with the row's line

| manifest | result |
| --- | --- |
| `[package]\nname = "app"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1.0"\n` | serde |
| `[dependencies]\nserde = { version = "1", features = ["derive"] }\n\n[dev-dependencies]\ninsta = "1"\n\n[build-dependencies]\ncc = "1"\n` | cc, insta, serde |
| `[target.'cfg(unix)'.dependencies]\nlibc = "0.2"\n[target.x86_64-pc-windows-msvc.dev-dependencies]\nwinapi = "0.3"\n` | libc, winapi |
| `[workspace]\nmembers = [\n  "crates/core", # core\n  "crates/cli",\n]\n\n[workspace.dependencies]\nanyhow = "1"\n` | anyhow |
| `[dependencies.tokio]\nversion = "1"\nfeatures = ["full"]\n` | tokio |
| `[dependencies]\njson = { package = "serde_json", version = "1" }\n` | serde_json |
| `[dependencies.yaml]\npackage = "serde_yaml"\nversion = "0.9"\n` | serde_yaml |
| `[dependencies]\nanyhow.workspace = true\n"quoted-name" = "1"\n` | anyhow, quoted-name |
| `[package]\ndescription = """\n[dependencies]\nfake = "1"\n"""\n[dependencies]\nreal = "1" # comment\n` | real |
| `[package]\nname = "app"\n[features]\ndefault = ["serde"]\n` | (none) |
| `[dependencies]\nserde = "1.0\n` | `line 2: ` |
| `[dependencies]\nserde = { version = "1"\n` | `line 2: ` |
| `[dependencies\nserde = "1"\n` | `line 1: ` |
| `[dependencies]\nserde "1"\n` | `line 2: ` |
| `[dependencies]\nserde = "1" extra\n` | `line 2: ` |

#### Scenario: No manifest reader for other languages
- **WHEN** `languageAdapter` is read for TypeScript/JavaScript, Python or Go
- **THEN** its `manifestDependencies` is null
