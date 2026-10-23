# languages Specification

## Purpose
Tells every slice which language a path is in and which of osq's gates and
extras cover that language, from one set of per-language facts, so a gate
never silently does nothing on a language it cannot read (ADR 017).

## Requirements

### Requirement: Code ownership
<!-- source: src/kernel/languages/**, tests/languages-*.test.ts -->
The languages capability SHALL own the language presets, the coverage list,
the language map and their tests.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for the language presets, the coverage list or the language map
- **THEN** system maps `src/kernel/languages/**` and `tests/languages-*.test.ts` to languages

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

### Requirement: Language of a path
`languageMap(paths)` SHALL build a language map from project-relative POSIX
paths. A path that is one of a preset's manifests marks its folder as a
package of that preset's language. The map's `languages` SHALL be every
language with at least one package, in preset order. Its `languageOf(path)`
SHALL find the nearest folder at or above the path's folder that holds a
package, and return the language of the package there that claims the path:
the path's extension is one of that language's extensions, or its file name is
one of its manifests or lock files. With no such folder, or no package there
that claims the path, it SHALL return null. The map reads no file.

#### Scenario: Paths and their languages
- **WHEN** a map is built from `package.json`, `crates/core/Cargo.toml` and `crates/core/notes.md`, and `languageOf` reads the path in the row
- **THEN** the map's `languages` are TypeScript/JavaScript, Rust, and `languageOf` returns the row's language

| path | language |
| --- | --- |
| `src/index.ts` | TypeScript/JavaScript |
| `pnpm-lock.yaml` | TypeScript/JavaScript |
| `crates/core/src/lib.rs` | Rust |
| `crates/core/Cargo.lock` | Rust |
| `crates/core/notes.md` | null |
| `crates/core/build.ts` | null |
| `tools/x.rs` | null |

#### Scenario: No manifest
- **WHEN** a map is built from `src/main.rs` and `notes.txt`
- **THEN** its `languages` are empty and `languageOf('src/main.rs')` is null

### Requirement: Project language map
`readLanguageMap(projectRoot, config, extra)` SHALL build the language map of
the project's tracked files, as `lineEndings()` of the `Vcs` that `selectVcs`
picks lists them, plus every preset manifest that exists at the project root,
plus the `extra` paths. With `NoVcs` it SHALL read the root manifests and
`extra` only. It writes nothing.

#### Scenario: Languages from manifests
- **WHEN** `readLanguageMap` reads a temporary project holding the manifests in the row
- **THEN** its `languages` are the row's

| manifests | git | languages |
| --- | --- | --- |
| `package.json` | yes | TypeScript/JavaScript |
| `package.json`, `crates/core/Cargo.toml` (tracked) | yes | TypeScript/JavaScript, Rust |
| `go.mod`, `tools/pyproject.toml` (tracked) | yes | Python, Go |
| `package.json`, `vendor/Cargo.toml` (ignored, untracked) | yes | TypeScript/JavaScript |
| `Cargo.toml` | no | Rust |
| none | no | (none) |

### Requirement: Test folders and paths of a map
A language map SHALL also carry `paths`, every path it was built from as a
project-relative POSIX path, each once, in the order first given, and
`testFolders`, every test folder of its packages, sorted: for each package
folder and each language of that package, each of the language's test
folders, joined to the package folder, or alone for a package at the root.

#### Scenario: Test folders of a Cargo workspace
- **WHEN** a map is built from `package.json`, `Cargo.toml`, `crates/core/Cargo.toml`, `crates/core/src/lib.rs`, `crates/cli/Cargo.toml` and `crates/cli/tests/run.rs`
- **THEN** its `testFolders` are `benches`, `crates/cli/benches`, `crates/cli/tests`, `crates/core/benches`, `crates/core/tests`, `tests`, and its `paths` are those six paths in that order

#### Scenario: TypeScript has no test folders
- **WHEN** a map is built from `package.json` and `packages/ui/package.json`
- **THEN** its `testFolders` are empty

### Requirement: Inline test modules
`languageAdapter(language)` in `src/kernel/languages/adapter.ts` SHALL return
the adapter that reads that language's code. Its `testModuleRanges` SHALL be
null for a language without inline test modules, and for Rust a function that
returns, for a source text, the line ranges, 1-based and inclusive, of every
`mod` item with a braced body that a `#[cfg(test)]` attribute annotates. A
range SHALL run from the attribute's line to the line of the module's closing
brace. Other attributes, comments and a visibility such as `pub(crate)` MAY
sit between the attribute and `mod`. Only outermost modules are returned, in
file order. Braces and attributes inside comments, nested block comments,
string literals, raw strings and char literals SHALL not count, and a
lifetime SHALL not start a char literal. It SHALL use osq's own reader and no
new dependency.

#### Scenario: Test module line ranges
- **WHEN** the Rust adapter's `testModuleRanges` reads the source in the row, written with `\n` for each line break
- **THEN** it returns the row's ranges

| source | ranges |
| --- | --- |
| `fn a() {}\n#[cfg(test)]\nmod tests {\n    fn t() {}\n}\n` | 2-5 |
| `#[cfg(test)]\n#[allow(dead_code)]\n// unit tests\npub(crate) mod tests {\n}\n` | 1-5 |
| `#[cfg(test)]\nmod tests {\n    const S: &str = "}";\n    const C: char = '}';\n    // }\n    /* } /* } */ */\n    const R: &str = r#"}"#;\n}\nfn after() {}\n` | 1-8 |
| `#[cfg(test)]\nmod tests {\n    fn f<'a>(x: &'a str) -> &'a str { x }\n}\n` | 1-4 |
| `#[cfg(test)]\nmod tests;\n` | (none) |
| `#[cfg(test)]\nfn helper() {}\n` | (none) |
| `// #[cfg(test)]\nmod tests {\n}\n` | (none) |
| `#[cfg(not(test))]\nmod a {\n}\n` | (none) |
| `#[cfg(test)]\nmod a {\n}\n#[cfg(test)]\nmod b {\n}\n` | 1-3, 4-6 |
| `#[cfg(test)]\nmod outer {\n    #[cfg(test)]\n    mod inner {\n    }\n}\n` | 1-6 |

#### Scenario: No inline test modules in TypeScript
- **WHEN** `languageAdapter('TypeScript/JavaScript')` is read
- **THEN** its `testModuleRanges` is null

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

### Requirement: Lock file of a manifest
`lockfileFollowsManifest(lockfile, manifests)` SHALL return true when the
file name of the project-relative POSIX path `lockfile` is one of a preset's
lock files and some path in `manifests` has a file name that is one of the
same preset's manifests, in the lock file's folder or a folder below it. A
lock file at the project root follows a manifest in any folder. Otherwise it
SHALL return false. It reads no file.

#### Scenario: Lock files and the manifests they follow
- **WHEN** `lockfileFollowsManifest` reads the row's lock file and manifests
- **THEN** it returns the row's result

| lock file | manifests | result |
| --- | --- | --- |
| `Cargo.lock` | `crates/kernel/specs/Cargo.toml` | true |
| `Cargo.lock` | `Cargo.toml` | true |
| `pnpm-lock.yaml` | `packages/ui/package.json` | true |
| `packages/ui/package-lock.json` | `packages/ui/package.json` | true |
| `crates/a/Cargo.lock` | `crates/b/Cargo.toml` | false |
| `crates/a/Cargo.lock` | `Cargo.toml` | false |
| `Cargo.lock` | `package.json` | false |
| `pnpm-lock.yaml` | `crates/core/Cargo.toml` | false |
| `Cargo.lock` | (none) | false |
| `src/lib.rs` | `Cargo.toml` | false |

### Requirement: Lock file rebuild command
`lockRebuildCommand(lockfile)` in `src/kernel/languages/lockfiles.ts` SHALL
return the offline command that rebuilds a lock file from its manifests, run
in the lock file's folder, or `null` when osq knows none. It reads the lock
file's name only and reads no file. A lock file with no command keeps a merge
conflict a conflict.

#### Scenario: Rebuild command of a lock file
- **WHEN** `lockRebuildCommand` reads the lock file in the row
- **THEN** it returns the row's command

| lock file | command |
| --- | --- |
| `Cargo.lock` | `cargo update --workspace --offline` |
| `crates/tools/Cargo.lock` | `cargo update --workspace --offline` |
| `pnpm-lock.yaml` | `null` |
| `go.sum` | `null` |
| `src/app.txt` | `null` |
