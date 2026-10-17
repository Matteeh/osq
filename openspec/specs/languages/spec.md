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
