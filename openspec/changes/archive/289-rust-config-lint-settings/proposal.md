---
title: The Rust config reads the limits block and banned words
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-config]
---
## Goal

Every lint limit comes from config, but the Rust config kernel reads no
`limits` table and no `bannedWords`, and refuses an `osq.toml` that holds
either. Rust lint rules that need them cannot be ported until it does. This
change reads a `[limits]` table with TypeScript's twelve keys and defaults,
and a `bannedWords` list with the checks and error text of TypeScript's
`validateBannedWordsConfig`, into `Config`.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic lints
and every Rust test, so it proves the two new config tests pass and the
existing config tests, among them the unknown top-level key test that names
`[limits]`, still do.

## Non-goals

- Using the limits or the banned words in any feature or lint rule.
- Any other config block, such as `gates` or `paths`.
- Changing TypeScript's config.

## Surface

- Added: `[limits]` table in `osq.toml` with the keys `maxScopeFiles`, `maxFeatureWrites`, `maxContractTables`, `maxAcceptanceLines`, `importGraphDepth`, `maxListedImporters`, `maxRuleLength`, `maxProjectRules`, `cardOutputLines`, `markerOutputLines`, `markerLineChars` and `maxListedLineEndings` (config keys), as `limits` in `osq.config.ts` holds them.
- Added: `bannedWords` list in `osq.toml`, entries with the keys `word` and `paths` (config keys), as `bannedWords` in `osq.config.ts` holds them.

## Decisions

- ADR 022: the change stays inside the config kernel; no crate gains a dependency.
- ADR 023: `read_limits` and `read_banned_words` each sit in their own block file beside `pi.rs`, reusing the shared value readers.
- ADR 024: every new public item ends its doc with `Implements: rust-config/lint-limits` or `Implements: rust-config/banned-words`, and each test names its `Covers:` scenario.
- ADR 025: the keys keep TypeScript's names.
- ADR 026: no spec parsing changes.
- ADR 027: no scheduling changes.
- ADR 028: no Feature changes.
- ADR 029: each limit default is a named constant in the config crate, a missing key takes it, and every bad key or value is a `ConfigError` naming its dotted key.

## Assumptions

- A limit follows the kernel's shared integer rule, so 0, a negative number or a float is refused, although TypeScript merges `limits` without any check. No project in this repository sets a limit to 0.
- Every `bannedWords` shape fault is one `InvalidValue` on the key `bannedWords`, so its text is TypeScript's single text `bannedWords must be a list of { word, paths } entries`, rather than a `WrongType` per inner key.
- An unknown key inside a `bannedWords` entry, such as `note`, is refused as `bannedWords.note`, where TypeScript ignores it; ADR 029 says nothing is ignored.

## Contract

### Requirement: Lint limits

See `specs/rust-config/spec.md`.

### Requirement: Banned words

See `specs/rust-config/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-config/spec.md`: ADDED "Lint limits" and "Banned words"; MODIFIED "Config file", which adds `limits` and `bannedWords` to the top-level keys and `limits` and `banned_words` to `Config`'s fields, and keeps its five scenarios.
