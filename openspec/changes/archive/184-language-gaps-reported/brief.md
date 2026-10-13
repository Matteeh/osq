---
queue_item: language-gaps-reported
queue_hash: sha256:6fb95ffb22a5298f3a7e5a7dc051bc261ec4cf40de77139c670decdd5d44ea46
planner: null
date: 2026-10-12
---

### Goal

On a project that is not TypeScript, osq stops pretending its TypeScript-only gates apply. `osq doctor` and the approve view name the project's languages and list each gate and extra that does not cover them, so a human never trusts a gate that silently does nothing. First step toward Rust projects, and so toward the Rust rebuild.

### Context

As of 2026-10-12, from the Notion page "Language support: osq on a project in any language" (checked against the code at 171):

- The test-modification gate (`src/core/run/test-gate.ts`, `src/watcher/verify.ts`) protects only test files under `tests/` or named `.test.`/`.spec.`. Rust unit tests in `src/*.rs`, Go `_test.go` and Python `test_*.py` beside the code are unprotected.
- The denied-dependency gate (`src/watcher/dependencies.ts`) reads only `package.json`.
- Verify-command lint warns on `cargo test` and suggests package scripts. Failing-test reading, focused runs, the import graph, traceability tags, function ranges and repository measures all assume TypeScript or node:test and fall back silently.
- `src/core/spec/digest-flags.ts` already knows `Cargo.toml`, `pyproject.toml` and `go.mod` and their lockfiles.
- Decided 2026-10-11: Rust is the second language; lean to detecting the language from manifests.

### Requirements

- osq detects the project's languages from the manifests it finds (`package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`), at the root and in subfolders that the repository tracks.
- `osq doctor` shows a `languages` check: the detected languages, and for each language other than TypeScript/JavaScript, every gate and extra that does not cover it. Gates are a warning; extras are listed as information.
- The approve view shows one line when the change's scope touches files of a language a gate does not cover, naming the gates.
- A pure TypeScript project sees no new warning.

### Non-goals

- Making any gate cover another language.
- A config override for detected languages.

### Notes for planning

- Keep the gate-to-language coverage list in one place, so the later language steps update it as they add support.
