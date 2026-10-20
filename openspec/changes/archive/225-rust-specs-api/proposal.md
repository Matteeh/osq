---
title: The Rust specs kernel exposes only what other crates use, so the link gates tag a small public API
depends_on: ["224"]
verify: sh scripts/verify-rust.sh
features:
  reads: []
---
## Goal

`rust-link-gates` will make ADR 024's rule "every public function has an
`Implements:` tag" blocking, and `rust-adr-parse` adds code to the specs
kernel next. Before either lands, the specs kernel's public surface should
be one small, deliberate list.

Today every module of `osq-kernel-specs` is public. That is 6 top-level
`pub mod`s and 18 public submodules, so each item is reachable at two or
three paths. No caller uses those paths: storage, and every test, imports
from the crate root. The crate's 31 public functions all carry an
`Implements:` tag already. Its 4 public methods do not.

This change makes the crate root the only public path. The top-level
modules become private and the submodules `pub(crate)`. The root keeps
re-exporting exactly the items it does today: each one is used by storage
or by the crate's own tests, or appears in the signature of one that is.
The 4 methods gain their tags. A new test in the crate pins the root's
export list, forbids a `pub mod`, and requires an `Implements:` tag on
every public function, so the surface only grows through a change that
edits the rust-specs "Public API" requirement.

## Verify

`sh scripts/verify-rust.sh`

The script runs `cargo fmt --all --check`, `cargo clippy` with
`-D warnings` and every workspace test, the corpus tests included, then
cargo-mutants on the change's own diff when osq sets `OSQ_DIFF`. Storage
and every specs test still compiling proves no caller used a module path,
and the existing rust-specs tests passing proves no behaviour changed.

## Non-goals

- Changing parsing, validation or merge behaviour.
- Making public functions private and rewriting their tests to go through
  a higher entry point. Each public function implements a rust-specs
  requirement whose tests call it directly, and the crate's tests live in
  `tests/`, so they can reach only public items.
- Narrowing other crates' APIs.

## Surface

- Removed: the public module paths of `osq-kernel-specs`, such as `osq_kernel_specs::markdown::text::js_trim`. Every item stays at its crate-root path, such as `osq_kernel_specs::js_trim`.

## Decisions

- ADR 022: storage keeps reading specs only through the specs kernel's root items. No crate or dependency changes.
- ADR 023: the visibility change touches no function body, and every item keeps its doc comment.
- ADR 024: every public function and method of the crate carries an `Implements: rust-specs/<requirement>` tag, and the new test enforces it for this crate until `rust-link-gates` checks it workspace-wide.
- ADR 025: nothing read from or written to disk changes.
- ADR 026: parsing, validation and merge stay in the specs kernel, unchanged.

## Assumptions

- A scratch run on 2026-10-20 made the 6 top-level modules private and the 18 public submodules `pub(crate)`. `cargo clippy --workspace --all-targets -- -D warnings` stayed clean, and every specs and storage test passed. No submodule can be fully private, because other modules reach into `markdown::text`, `markdown::types` and `validate::change`.
- `FindingCode::fix`, `FindingCode::as_str`, `MergeError::capability` and `MergeError::requirement` stay public. The crate's tests call each one.
- `Frontmatter`, `SyntaxError`, `Outcome`, `Scenario` and `UnpairedRename` are named by no other crate, but they stay public because public functions return them or public fields hold them.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-specs/spec.md`: ADDED "Public API".
