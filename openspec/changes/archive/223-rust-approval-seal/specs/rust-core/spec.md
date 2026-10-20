## ADDED Requirements

### Requirement: Seal computation
`compute_seal` SHALL give, without IO, the `Seal` that `hashChangeFolder`
gives for a folder holding exactly the given entries of relative path and
bytes. Content SHALL be decoded as JavaScript decodes UTF-8, with CRLF turned
into LF and, in `tasks.md` alone, checkboxes reset as `normalizeTasksMd` does.
Entries SHALL be ordered by path in UTF-16 code unit order.

#### Scenario: Seals of entries
- **WHEN** `compute_seal` runs on the entries of each row below, written as `path`: content
- **THEN** the seal is as given:

| Entries | Seal |
|---|---|
| none | `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `proposal.md`: `a\n` | `sha256:0dde7716d600b92d32148bafc60a3111581ee9c4836ae6925c584dcaac2ab9bd` |
| `a.md`: `x\r\ny\r\n` | `sha256:84e73026f37063934c900dfa2c1ecf3f8fdebffc3b1483d78a2275a21b248241` |
| `a.md`: `x\ny\n` | `sha256:84e73026f37063934c900dfa2c1ecf3f8fdebffc3b1483d78a2275a21b248241` |
| `tasks.md`: `- [x] 1. a\n  - [X] 2. b\n` | `sha256:c66367cc16aa800f014845d20689fc87356ebee7053a9dfd46653693529a011a` |
| `tasks.md`: `- [ ] 1. a\n  - [ ] 2. b\n` | `sha256:c66367cc16aa800f014845d20689fc87356ebee7053a9dfd46653693529a011a` |
| `notes/tasks.md`: `- [x] 1. a\n` | `sha256:fa65172b5ab5cee5da25838e4c968ded29d7a4837aa65283758225af2586088f` |
| `tasks.md`: U+00A0 then `- [x] a\n` | `sha256:ba2854b7aadd6685d64d1624f7b144e4b5e5d69e017060244b846491ef0b304b` |
| `tasks.md`: U+0085 then `- [x] a\n` | `sha256:52902fea6a1daefdb3316706390ca2fc5a816709f0eb28a514aacc0a31f007d0` |
| `b.bin`: the bytes `FF FE 41` | `sha256:f2859d36ed56daac01133dde3da6a05522a65da80d2fe1659fd1cf64716c8ac8` |

#### Scenario: JavaScript path order
- **WHEN** `compute_seal` runs on `a-｡.md` (U+FF61): `2\n` and `a-😀.md` (U+1F600): `1\n`, given in that order and again in the reverse order
- **THEN** both seals are `sha256:f47bbfc7ba5286ec24f4ddf82d9bf58771d785ef0b0806c45b8e4ca2ff469938`, the seal of UTF-16 order, and neither is `sha256:e5c08cd78230313694389dde3ad3ff879ccbdf90e1e3c5b738ea76dcf9328e79`, the seal of byte order

## MODIFIED Requirements

### Requirement: Core does no IO
The `osq-core` crate SHALL depend only on `serde`, `serde_json` and `sha2` at
runtime, and no file under `crates/core/src/` SHALL name `std::fs`,
`std::process`, `std::env`, `std::net`, `std::thread`, `SystemTime` or
`Instant`. Tests and dev-dependencies are exempt.

#### Scenario: Core source names no IO module
- **WHEN** the `[dependencies]` table of `crates/core/Cargo.toml` and every `.rs` file under `crates/core/src/` are read
- **THEN** the table names exactly `serde`, `serde_json` and `sha2`, and no file contains `std::fs`, `std::process`, `std::env`, `std::net`, `std::thread`, `SystemTime` or `Instant`
