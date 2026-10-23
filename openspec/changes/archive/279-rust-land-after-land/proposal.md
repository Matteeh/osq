---
title: Rust land runs the configured after-land command and records a failure
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-config, rust-harnesses, rust-runners]
---
## Goal

`vcs.afterLand` runs a command in the checkout after each land, such as a
rebuild. Rust land skips it, so a Rust land leaves the checkout stale.
This change makes Rust land run the command after a successful land, as
TypeScript's `runAfterLand` does. A pass clears the failure record and
adds the passed line. A failure writes TypeScript's `after-land.json`
under `~/.osq/watch/<hash>/`, which TypeScript's inbox reads, and fails
the command with the output tail and the retry line. The land commit
stays in place either way. With the key unset, land's output is
unchanged.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints and every Rust test, the link gates and the mutation check of the
changed lines included. It proves the after-land rows on scratch land
repositories with passing, failing, noisy and slow commands, and that
every earlier land test still passes.

## Non-goals

- Retrying the command when an already landed change lands again; the inbox item for that is `rust-inbox-pending-items`.
- The progress line `Running after-land command: <command>`, which TypeScript writes to stderr; a Rust feature returns one text.
- TypeScript's CLI rebuild hint for osq's own source.

## Surface

None

## Decisions

- ADR 003: the command runs only after osq's own land commit and fast-forward, and it never runs git for the human.
- ADR 007: the command runs with the role environment `run_verify` builds, so no model key reaches it.
- ADR 022: land calls only the config, storage, vcs and harnesses kernels; the record writer lives in the land crate.
- ADR 023: the tail, the record and the lines are pure functions; the land orchestrator runs the command and writes the record.
- ADR 024: every public item ends its doc with `Implements: rust-land/<requirement>`, and each test names `Covers: rust-land/<scenario>`.
- ADR 025: the record is TypeScript's `after-land.json`, at TypeScript's path, with its keys.
- ADR 026: no OpenSpec reading changes.
- ADR 027: no scheduling changes.
- ADR 028: `LandFeature` stays a unit struct with its one command.
- ADR 029: the command and both timeouts come from `Config`. The 20-line tail is TypeScript's `limits.cardOutputLines` default, held as a constant because the Rust config has no `limits` block yet.

## Assumptions

- TypeScript runs the command with the prepare role's environment. Rust's `role_env` treats prepare and verify the same, and the Rust config reads no configured names, so `run_verify` gives the same environment.
- The tests write the record under the real `$HOME/.osq/watch/<hash>/` of their scratch checkout, because a feature reads `HOME` and tests can't set it. Each scratch checkout has its own hash, and each test removes its record.
- A failed after-land exits 1 with every line on stderr after `land failed: `, where TypeScript prints them on stdout and exits 1.

## Contract

### Requirement: Land after-land command

See `specs/rust-land/spec.md`, and the MODIFIED "Land commit".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-land/spec.md`: MODIFIED "Land commit", so its output ends with the after-land lines and it runs only the after-land command; ADDED "Land after-land command".
