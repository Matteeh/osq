---
status: accepted
applies_to: [group:rust]
rule: "Code reads like a book: small named functions in layers, pure leaves, thin orchestrators holding the IO, and a doc comment on every function, enforced by lints."
checks:
  - tests/rust-adrs.test.ts
---
# 023. Rust code style, layered named functions and required docs

Date: 2026-10-17

## Status

Accepted by Mathias on 2026-10-17, numbered 002 on the Notion Rust Rebuild
page. Drafted from Mathias's code style preferences of 2026-10-17 and the
adjustments discussed in the project thread.

Scope: this ADR governs every capability in group `rust`, the Rust crates, not the
TypeScript code under `src/`, which keeps its own ADRs until it is deleted.
The rule above is shortened to fit `limits.maxRuleLength`. Section 4 holds the
full wording: the lints are the workspace lints.

## Context

Mathias likes the functional style he uses in TypeScript: small helper
functions with good names, so the code reads like a book. He also wants every
function and method documented, and the docs enforced rather than hoped for.

Rust already gives much of this style through iterators, `Option` and
`Result` combinators, `?` and `match` on enums. Splitting too far has costs
that TypeScript doesn't have. A method that takes `&mut self` borrows the
whole struct, so a chain of small methods often won't compile, and deep chains
of `?` hide where a function can return early. Rust's convention is full docs
on public items, and docs on every private helper tend to turn into noise
unless they stay short.

Most code in osq will be written by agents. A style that a lint can check is
worth more than one that relies on review.

## Decision

### 1. Functions are layered

- **Leaves do one small thing.** A leaf works on data it is given and returns
  a value. Leaves are pure: no file, git, network, clock or environment
  access.
- **Orchestrators read as a list of named steps.** A parent such as
  `land_change` calls leaves and other orchestrators, and its body reads like
  the steps of the feature. Each function stays at one level of detail.
- **IO lives at the edges.** File access, git, spawning and error handling for
  them sit in the thin orchestrators and the kernel adapters, never in leaves.
  The parent then shows every place the work can stop or touch the outside
  world.
- **Split when the name says something new.** A helper earns its place by
  naming a step. Splitting only to make a function shorter is not a reason.
- **Use the language first.** Reach for iterators, `?` and enums with `match`
  before adding a helper. A clear 30 line function beats five one-line
  wrappers.
- **Free functions over `&mut self` chains.** Pass the fields a step needs
  instead of the whole struct, so splitting doesn't fight the borrow checker.

### 2. Every function has a doc comment

- **Public items get full docs.** `#![deny(missing_docs)]` in every crate. A
  public function's doc says what it does and carries its requirement tag per
  ADR 024.
- **Private items get at least one line.**
  `clippy::missing_docs_in_private_items` at deny. One line that says why the
  function exists is enough.
- **Docs explain intent, not the signature.** "Returns the name" is not a doc.
  The doc says what the step means in the feature.

### 3. No abstraction ahead of need

- **No trait before a second implementation.** A trait in core exists because
  two kernel adapters or a test double need it. Otherwise use a concrete type.
- **No macros for ordinary code.** Macros are for derive and test helpers, not
  for hiding control flow.

### 4. Workspace lints are the rulebook

The workspace `Cargo.toml` holds one `[workspace.lints]` table, and every
crate inherits it with `lints.workspace = true`. A crate may not loosen a
workspace lint. The table includes at least `missing_docs = "deny"`,
`clippy::missing_docs_in_private_items = "deny"`, `clippy::pedantic` at warn
with chosen lints at deny, `unsafe_code = "forbid"`, and size limits such as
`clippy::too_many_lines` with the threshold taken from `clippy.toml`.

## Enforcement

- `cargo clippy --workspace -- -D warnings` runs in every verify and at
  archive. A failure kills the task like any other verify failure.
- An osq lint gate checks that every crate's `Cargo.toml` has
  `lints.workspace = true` and no local `[lints]` that weakens a workspace
  entry, and that no file uses `#[allow(...)]` for a denied lint without a
  reason comment.
- An osq lint gate on leaf purity: functions in `core` may not call `std::fs`,
  `std::process`, `std::env`, `std::net` or the clock. Core has no IO
  dependencies in `Cargo.toml`, so Cargo enforces most of this, and the gate
  catches the rest from the `syn` parse.
- An osq lint gate that flags a trait in `core` or the kernel with only one
  implementation outside tests, as a measuring rule first.
- The layering and naming rules in section 1 can't be fully checked by a
  machine. They are part of the executor's prompt, and the validator agent
  reviews changes against them.

## Consequences

- Agents get a short, checkable style. Most of it is a lint failure, not a
  review comment.
- Docs on private items add some lines. They stay one line, and agents write
  them cheaply.
- Core stays pure by construction, which keeps the fold and the gates easy to
  test with `proptest`.
- Function size limits from the TypeScript version move into `clippy.toml`
  instead of a custom test.

## Rejected

- **Full docs on every private item.** It produces noise like "Returns the
  name", which agents then copy.
- **Docs only on public items.** Mathias wants every function documented, and
  one line on private items is cheap.
- **Methods on large structs as the main style.** It fights the borrow checker
  and hides which data a step uses.
- **A trait for every boundary up front.** In Rust that is the usual way
  unneeded abstraction creeps in.
