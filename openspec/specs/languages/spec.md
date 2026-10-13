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
order, with its manifests, lock files and extensions:

| language | manifests | lock files | extensions |
| --- | --- | --- | --- |
| TypeScript/JavaScript | `package.json` | `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` | `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs` |
| Rust | `Cargo.toml` | `Cargo.lock` | `.rs` |
| Python | `pyproject.toml` | `poetry.lock`, `uv.lock` | `.py` |
| Go | `go.mod` | `go.sum` | `.go` |

`LANGUAGE_COVERAGE` SHALL be the one list of which languages each gate and
extra covers, and a change that makes one cover another language SHALL update
it. It is, in this order:

| name | kind | covers |
| --- | --- | --- |
| test-modification gate | gate | TypeScript/JavaScript |
| denied-dependency gate | gate | TypeScript/JavaScript |
| verify-command lint | extra | TypeScript/JavaScript |
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
| Rust | test-modification gate, denied-dependency gate | verify-command lint, test output reading, import graph, traceability, function ranges, repository measures |
| TypeScript/JavaScript | (none) | (none) |

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
