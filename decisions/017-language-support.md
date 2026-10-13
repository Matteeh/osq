---
status: accepted
applies_to: all
rule: A path's language comes from its nearest manifest; language-specific code sits behind the languages kernel adapter, and a gate names the languages it misses.
---
# 017. Language support

Date: 2026-10-12

## Status

Accepted

## Context

Every gate and extra osq has assumes TypeScript and node:test. The
test-modification gate protects only files under `tests/` or named `.test.` or
`.spec.`, so Rust unit tests in `src/*.rs`, Go `_test.go` files and Python
`test_*.py` files are unprotected. The denied-dependency gate reads only
`package.json`. Failing-test reading, focused runs, the import graph, function
ranges, traceability tags and repository measures read TypeScript or node:test
output and fall back without a word on anything else. The code that knows this
is spread over `src/core/run`, `src/watcher`, `src/core/spec` and
`src/core/trace`.

Rust is the second language osq should support, decided on 2026-10-11, and the
first step toward the Rust rebuild. Without one seam, each gate would learn
Rust on its own, with its own detection and its own fallback, and the third
language would cost as much as the second.

ADR 016 makes capabilities vertical slices, with shared code in kernel slices
under `src/kernel/`. ADR 006 says a gate blocks or is removed; a gate that does
nothing on a language is removed for that language, and a human must be able
to see that.

## Decision

1. **A path's language comes from its nearest manifest.** The manifests are
   `package.json` (TypeScript/JavaScript), `Cargo.toml` (Rust),
   `pyproject.toml` (Python) and `go.mod` (Go). A path has its nearest
   manifest's language when its extension is one of that language's
   extensions, or when it is that manifest or its lock file. Any other path has
   no language, so a crate's `README.md` is not Rust. A project has every
   language that one of its tracked manifests names, so one repository may
   hold several.
2. **Facts are data; reading code is an adapter.** What a language is made of
   is data in one preset per language: its manifests and lock files,
   extensions, test file patterns and test runners. A project may override the
   facts in config later. Reading code, such as imports, function ranges,
   failing tests and doc-comment tags, is code in one adapter per language.
3. **The code is a kernel slice.** It lives in `src/kernel/languages/`, owned
   by the kernel capability `languages`, next to ADR 016's six kernel slices.
   Gates in any slice ask it for a path's language and that language's facts
   and adapter. It never imports a feature slice.
4. **A gate covers a language or says it does not.** One coverage list in the
   slice names, for each gate and each extra, the languages it covers. Where a
   gate does not cover a language, osq counts that gate as removed for it
   (ADR 006) and says so where a human looks, such as `osq doctor` and the
   approve view. A gate never passes on a language it cannot read.
5. **The adapter grows only where languages differ.** It starts with the
   methods the first gates need. A method is added when a second language
   really needs different code, not before. Where a shared format exists, osq
   reads that once instead of one format per language: JUnit XML for test
   results, which node, cargo-nextest, pytest and go test can all write.
6. **No new runtime dependency.** An adapter reads manifests and output with
   osq's own code or the `yaml` package, or runs the language's own tool, such
   as `cargo metadata`, as a child process. A parser, tree-sitter or a
   language server needs its own ADR.
7. **TypeScript moves behind the adapter one gate per change.** Today's
   TypeScript code stays where it is until a change moves one gate or extra
   behind the adapter and updates the coverage list. A second language then
   needs only its preset, its adapter and the coverage list.

## Consequences

- A change that adds Rust to a gate touches the `languages` slice and that
  gate, not every place that knows about test files.
- A project that mixes languages, such as a Rust crate with a TypeScript UI,
  gets each gate for each part it covers, and a warning for each part it does
  not.
- Until the moves land, the coverage list says that every gate covers only
  TypeScript/JavaScript, so a Rust project sees every gap.
- A language with no manifest, such as plain shell scripts, has no language
  and no gate coverage to report.

## Rejected

- **One language per project.** Monorepos and tools in a second language are
  common, and a per-project language would apply the wrong gate to part of
  the tree.
- **Language from the extension alone.** A `.ts` script in a Rust repository
  would count as a TypeScript package, and a file outside every package would
  get gates it has no runner for.
- **A full adapter interface up front.** Methods guessed before a second
  language exists would be shaped by TypeScript and would need changing anyway.
- **tree-sitter or a language server for code reading.** A new runtime
  dependency, native builds or a long-running process. Revisit with the Rust
  rebuild.
- **A feature slice per language.** Every gate in every slice needs the
  answer, so the code is shared, and shared code is kernel under ADR 016.
