---
queue_item: rust-approval-seal
queue_hash: sha256:f2bf68018b2d214284c34432a4340219195c3690ac9016049380cbdef24ab774
planner: null
date: 2026-10-19
---

### Goal

ADR 025 section 3 holds in Rust: the folder hash in `.run/approved` and the hashes in `manifest.json` come out the same from Rust as from `src/core/spec/hasher.ts`.

### Context

As of 2026-10-19:

- `crates/core/src/seal.rs` parses and compares a seal (`Seal::parse`, rust-core "Approval seal") but never computes one. Its module doc says core never computes one over a change folder.
- ADR 025 section 3 fixes the algorithm: exclude the segments `.run`, `.git` and `.DS_Store` at any depth and `plan-prompt.md` at the root only; turn CRLF into LF; reset `tasks.md` checkboxes to unchecked; sort paths in JavaScript string order (UTF-16, not Rust's byte order); hash each entry as path, NUL, content, NUL; prefix `sha256:`. `hashChangeFolder` and `normalizeTasksMd` in `src/core/spec/hasher.ts` are the reference.
- `manifest.json` in each change's `.run/` holds more hashes, keyed by `AGENTS.md`, `PLANNER.md`, `config`, a capability, or a capability's `osq.yml`.
- 217 of 218 archived changes have a `.run/approved` marker. Archiving changes a folder after approval, so some archived seals may no longer match their folder.
- The Rust roadmap decided (2026-10-18) on a pure hash in core with a new SHA-256 dependency, and the folder walk and golden test in storage.

### Requirements

- Core computes the seal from a list of (relative path, content) pairs with ADR 025's normalization and ordering, and does no IO. A test proves the JavaScript order with a non-ASCII path that byte order would put elsewhere.
- Storage walks a change folder with ADR 025's exclusions and gives its seal.
- A golden test checks the seal of fixture folders against hashes printed once by `hashChangeFolder` and committed as fixtures. The test never runs node.
- A corpus test hashes every archived change folder and compares the result with its `.run/approved`. It either matches every one, or names the changes that no longer match as a fixed list with the reason, as the storage replay test does.
- Adding the SHA-256 crate goes through the dependency gate, with the ADR it needs.

### Non-goals

- The `manifest.json` hashes other than the change folder's own, unless they share the same function.
- An approve or verify command in Rust.
