## MODIFIED Requirements

### Requirement: Languages doctor check
When the `languages` of `readLanguageMap` for the project hold any language
other than TypeScript/JavaScript, `osq doctor` SHALL add a `languages` check
right after the `git` checks. Its message SHALL be those languages joined by
`, `, then, for each of them other than TypeScript/JavaScript that `uncoveredBy`
gives a gate or extra,
`. <language> lacks gates: <gate>, <gate>; extras: <extra>, <extra>`, leaving
out the `gates:` or `extras:` part that would be empty. The check SHALL pass
with a warning when some language lacks a gate, and pass without one
otherwise, so it never changes doctor's exit code. When every language is
TypeScript/JavaScript, or there is none, doctor SHALL add no `languages`
check.

#### Scenario: Rust beside TypeScript
- **WHEN** `osq doctor` runs on a temporary git project that tracks `package.json` and `crates/core/Cargo.toml`
- **THEN** it prints `[ok] languages: TypeScript/JavaScript, Rust. Rust lacks extras: test output reading, import graph, traceability, function ranges, repository measures` and its exit code is what it is without the check

#### Scenario: Pure TypeScript project
- **WHEN** `osq doctor` runs on a temporary project whose only manifest is `package.json`, or on one with no manifest
- **THEN** the report has no `languages` check

#### Scenario: Python beside TypeScript
- **WHEN** `osq doctor` runs on a temporary git project that tracks `package.json` and `tools/pyproject.toml`
- **THEN** it prints `[warn] languages: TypeScript/JavaScript, Python. Python lacks gates: test-modification gate, denied-dependency gate; extras: verify-command lint, test output reading, import graph, traceability, function ranges, repository measures`
