---
title: Rust osq doctor prints TypeScript's languages, prices, containment and validator checks
depends_on: []
verify: cargo test -p osq-kernel-config -p osq-kernel-storage -p osq-feature-doctor -p osq-feature-plan
features:
  reads: [rust-harnesses, rust-vcs]
---
## Goal

On this repository TypeScript's `osq doctor` prints 16 checks and Rust
prints 7. Rust prints the harness lines only for pi, and no containment,
languages, planning-prices or validator lines. This change ports those
checks, so Rust doctor tells a human the same things with TypeScript's
names, statuses, texts and order, and fails when TypeScript's fails.

Two checks need config Rust does not read yet: the harness tables `agy`,
`opencode`, `codex` and `claude`, and `planning.prices`. The config kernel
gains them with TypeScript's defaults. The prices check also needs the
models of planning sessions that recorded tokens, which the storage kernel
gains as one reader.

TypeScript's `validator` line checks the version of the Node OpenSpec CLI.
Rust never runs that CLI (ADR 026), so it has no counterpart.

## Verify

`cargo test -p osq-kernel-config -p osq-kernel-storage -p osq-feature-doctor -p osq-feature-plan`
runs every test of the three crates the change writes, and of the plan
crate, the other reader of `Config.planning`, which loses `Copy`. It proves
the new config tables and prices, the planning token models, and every
doctor line against texts printed by TypeScript's `dist` on scratch
projects with the fake harness program. The watcher also runs
cargo-mutants on the touched lines.

## Non-goals

- Running the validator.
- TypeScript's `validator` line, which checks the OpenSpec CLI's version (ADR 026).
- The `model` keys of the `agy`, `opencode`, `codex` and `claude` tables; Rust keeps every model in `executor.model`.
- `OSQ_MODEL`, which TypeScript reads as the executor's model for some harnesses.
- A Rust languages kernel; see Decisions.

## Surface

- Added: `osq.toml` `[agy]` `dangerouslySkipPermissions` (config key).
- Added: `osq.toml` `[opencode]` `bin` and `agent` (config keys).
- Added: `osq.toml` `[codex]` `bin` (config key).
- Added: `osq.toml` `[claude]` `bin` and `sandbox` (config keys).
- Added: `osq.toml` `planning.prices` (config key).
- Added: Rust `osq doctor` lines `harness` for every harness, `harness-version` for opencode and claude, `harness-containment`, `languages`, `planning-prices`, `validator-runs`, `validator-harness`, `validator-harness-version`, `validator-harness-auth` and `validator-model`.
- Changed: Rust `osq doctor` with no `osq.toml` fails, as TypeScript's does, since agy's containment line fails without `agy.dangerouslySkipPermissions`.

## Decisions

- ADR 022: doctor reads plan records and validator runs through rust-storage (`planning_token_models`, `read_change`, `validator_failing`) and calls no other feature.
- ADR 023: each new check is a pure line builder in its own module over facts the orchestrator reads; `run_doctor` stays the one function that orders the lines.
- ADR 024: every public item ends its doc with `Implements: <capability>/<requirement>`, and each test names `Covers: <capability>/<scenario>`.
- ADR 025: `osq.toml` gains hand-written tables and keys; nothing else on disk changes, and doctor writes no file.
- ADR 026: TypeScript's `validator` line has no Rust counterpart, since Rust never runs the OpenSpec CLI.
- ADR 027: no scheduling changes.
- ADR 028: `DoctorFeature` keeps its one command; only its lines grow.
- ADR 029: the new keys read in the config kernel with TypeScript's defaults, and any unknown key is a typed error, a key inside a price entry included.
- Departs from ADR 017: Rust has no languages kernel yet, so the doctor crate holds TypeScript's language manifests and gate coverage list as data, as the lint crate holds its manifest names, until one exists.

## Assumptions

- The `validator` line is left out rather than probing the Node `openspec` binary; the human chose this while planning.
- The executor's model in `validator-model` is `executor.model`, else `pi.model` for pi, else `default`.
- The managed-block and decisions tests keep their default-config roots, so they now run the real `agy --version` when agy is installed (about 0.5 s here). Their scenarios check one line, so they pass with or without agy.
- An archived folder that `read_change` cannot read adds no validator runs; TypeScript reads its validator events alone.

## Contract

### Requirement: Harness settings and prices

See `specs/rust-config/spec.md`: ADDED "Harness settings", MODIFIED
"Config file" and "Planning settings".

### Requirement: Planning token models

See `specs/rust-storage/spec.md`, ADDED "Planning token models".

### Requirement: Every harness and its containment

See `specs/rust-doctor/spec.md`: ADDED "Doctor harness checks", MODIFIED
"Doctor pi checks", "Doctor change checks" and "Doctor git checks".

### Requirement: Languages, prices and validator lines

See `specs/rust-doctor/spec.md`: ADDED "Doctor languages", "Doctor
planning prices" and "Doctor validator checks".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-config/spec.md`: ADDED "Harness settings"; MODIFIED "Config file" (new top-level keys and fields, `Config` no longer `Eq`) and "Planning settings" (`prices`, new scenario "Planning prices").
- `specs/rust-storage/spec.md`: ADDED "Planning token models".
- `specs/rust-doctor/spec.md`: ADDED "Doctor harness checks", "Doctor languages", "Doctor planning prices" and "Doctor validator checks"; MODIFIED "Doctor pi checks" (line order, config fallback, rows with the containment line, the config-error row moved to "Doctor harness lines"), "Doctor change checks" (scenario roots on the mock harness) and "Doctor git checks" (a scenario run may fail).
- Shared files: `crates/features/doctor/src/**` is in the scope of tasks 3 and 4; task 4 runs after task 3 and extends the files task 3 writes.
