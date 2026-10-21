---
status: accepted
applies_to: [group:rust]
rule: Rust osq reads osq.toml in the config kernel into typed values, with TypeScript's default for each missing key and a typed error naming any bad key.
checks:
  - tests/rust-adrs.test.ts
  - crates/kernel/config/tests/config_file.rs
  - crates/kernel/config/tests/roles.rs
---
# 029. Rust config

Date: 2026-10-21

## Status

Accepted by Mathias on 2026-10-21, when he approved change 252,
rust-config-kernel. It fills in the config step of ADR 025, which says
`osq.config.ts` becomes a hand-written `osq.toml` and that every limit and
timeout still comes from config, without saying where Rust reads it.

Scope: this ADR governs every capability in group `rust`, the Rust crates, not
the TypeScript code under `src/`.

## Context

Three Rust kernels already wait on settings that TypeScript reads from
`osq.config.ts`: the vcs kernel's git timeouts, the inbox's items that depend
on `vcs.enabled`, and the runners kernel's role settings, which its callers
build by hand today. Without a config crate each of them either takes the
value from its caller or writes TypeScript's default as a number in code,
which AGENTS.md forbids.

TypeScript merges `DEFAULT_CONFIG` with the project's `osq.config.ts`, block
by block, and validates each block in its own `config-*.ts` file. Rust cannot
run `osq.config.ts` (ADR 025), so the project writes `osq.toml` by hand at the
switch.

## Decision

### 1. Config is a kernel crate

The config kernel is the crate `osq-kernel-config` in `crates/kernel/config`,
capability `rust-config`. It depends on no other workspace crate, so any
kernel, feature or app crate may depend on it without a cycle.

Only the app that runs a command, and tests, call `load_config`. Every other
crate takes the typed value it needs, such as `&Timeouts` or `&VcsConfig`, as
an argument and never reads `osq.toml` itself. A setting reaches a kernel
through its caller, typed, never as a bare number.

### 2. osq.toml keeps TypeScript's names

`osq.toml` sits at the project root. Its keys and blocks keep the names
`osq.config.ts` uses, in camelCase, such as `maxConcurrency` and
`[timeouts] gitSeconds`, so translating one into the other is mechanical.
The one exception is the roles: the executor's harness and model, which
TypeScript keeps in the top-level `harness` and each harness's own block,
move into an `[executor]` table beside `[planner]` and `[validator]`.

### 3. TOML through the toml crate, walked by hand

The config kernel parses `osq.toml` with the `toml` crate, version 1, with
default features off and only `parse`, `std` and `serde`, into a
`toml::Table`. Hand-written pure functions walk that table into the typed
values. The config types derive no serde traits, so every error is a typed
`ConfigError` that names its dotted key, such as `timeouts.gitSeconds`, as
data rather than inside a message.

`toml` and the crates it pulls in are the only new dependencies. They pass
the watcher's denied-dependency gate, which reads Cargo manifests, since no
accepted ADR denies them. No other crate depends on `toml`.

### 4. A missing file or key takes TypeScript's default

A project without `osq.toml` gets `Config::default()`, which holds
`DEFAULT_CONFIG`'s values for every block the crate reads. A key left out of
the file takes the same default. The defaults are named constants in the
config crate, the only place in the Rust workspace where a limit or a
timeout is written as a number.

### 5. Nothing is ignored

An unknown key, a value of the wrong type and a value TypeScript would refuse
are each a typed error naming the key. The file is never partly applied. The
crate grows one block at a time: until a block, such as `limits` or `gates`,
joins the crate, an `osq.toml` that holds it is refused, so a setting never
looks applied when nothing reads it.

### 6. What the config kernel leaves for later

- Environment overrides such as `OSQ_HARNESS` and `OSQ_MODEL`, and loading
  `.env`, when the CLI app is built.
- The other config blocks, each in the change that first needs it.
- Writing `osq.toml` from `osq.config.ts`, which ADR 025 leaves to the switch.

## Enforcement

- `tests/rust-adrs.test.ts` checks that this ADR is accepted, applies to group
  `rust`, names its checks and is linked from the index.
- `crates/kernel/config/tests/config_file.rs` checks the missing file, a
  loaded file, the syntax error and every error's text.
- `crates/kernel/config/tests/roles.rs` checks the role defaults and errors.
- Cargo enforces section 1: the config crate's manifest names no workspace
  crate, and a crate that uses the types must depend on it.

Not enforced yet, each with the work that will enforce it:

| Rule | Enforced by |
| --- | --- |
| Only the app and tests call `load_config` | the CLI app, when it is built |
| No other crate depends on `toml` | a Rust dependency gate, when one is built |
| No limit or timeout is a number outside the config crate | review, until a lint gate exists |

Each of those changes adds its tests to this ADR's `checks`.

## Consequences

- The vcs, inbox and runners kernels can take their settings from `Config`
  in their own changes, and none of them reads a file for it.
- A typo in `osq.toml` stops osq with the key named, instead of silently
  running on a default.
- Each new block is a change to the config crate, which ADR 027 locks as a
  whole, so blocks join one at a time.
- `osq.toml` refuses blocks the crate does not read yet, so the file written
  at the switch must wait until every block it holds has joined the crate.

## Rejected

- **Serde derive with `deny_unknown_fields`.** Shorter, but the bad key would
  only appear inside the error's message text, and TypeScript's defaults and
  value rules would hide in serde attributes.
- **`toml_edit`.** It keeps formatting and comments for writing files back,
  which osq never does with `osq.toml`.
- **A hand-written TOML parser.** TOML's grammar is larger than it looks, and
  the `toml` crate is the standard one.
- **Each kernel reading its own block.** Every kernel would read the file
  again and need the project root, and a test would have to write a file to
  set one value.
- **Ignoring unknown keys.** A misspelt key would run on the default without
  a word.
