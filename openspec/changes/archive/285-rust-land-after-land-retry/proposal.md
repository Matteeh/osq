---
title: Rust land on a landed change reruns a failed after-land command
depends_on: ["280"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-config, rust-harnesses, rust-storage]
---
## Goal

When an after-land command fails, the inbox card tells the human to run
`osq land <id>` again. In TypeScript, `landChange` reruns the command for
a landed change through `retryAfterLand`, but only when the failure record
names that change. In Rust, a second land of a landed change only prints
the already-landed line, so the card's advice does nothing. This change
makes Rust land do what TypeScript does. After the landed-change refusals,
when `vcs.afterLand` is set and the record names the change, land reruns
the configured command in the checkout. A pass clears the record and puts
the passed line before the landed line. A failure rewrites the record and
fails with TypeScript's lines and exit code 1. Everything else stays as
it is today.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints, every Rust test, the link gates, and the mutation check of the
changed lines. It proves the retry rows on scratch land repositories with
passing and failing commands, with records that name this change, another
change or nothing, and that a refused land runs nothing. It also shows
that every earlier land test still passes.

## Non-goals

- Moving the 20-line output tail into config.
- Removing a landed change's worktree, which Rust land does not do yet.
- The progress line `Running after-land command: <command>`, which TypeScript writes to stderr.

## Surface

None

## Decisions

- ADR 003: the rerun happens only for a change the default branch already holds, and land makes no commit and runs no git write for it.
- ADR 007: the rerun goes through the same `run_verify` request as the first run, so no model key reaches it.
- ADR 022: land reads the record only through rust-storage's `read_after_land_failure`, which 280 adds, and writes it with its own writer from 279.
- ADR 023: the retry decision is a small named function in `land/after.rs`; `run_land` calls it in one line where it returns the landed line today.
- ADR 024: every public item ends its doc with `Implements: rust-land/<requirement>`, and each test names `Covers: rust-land/<scenario>`.
- ADR 025: the record keeps TypeScript's `after-land.json` path and keys, so TypeScript's inbox and land read what Rust writes.
- ADR 026: no OpenSpec reading changes.
- ADR 027: no scheduling changes.
- ADR 028: `LandFeature` stays a unit struct with its one command.
- ADR 029: the command and both timeouts come from `Config`, as in 279.

## Assumptions

- 280 lands before this change runs, or this change stacks on it. 280 adds `read_after_land_failure` and `AfterLandFailure` to `osq-kernel-storage` as its "After-land failure record" says, and `osq-feature-land` already depends on that crate.
- The record is read at the checkout's repository root, the root 279's writer uses. TypeScript uses the project root, which is the same folder for a checkout.
- A failed retry exits 1 with every line on stderr after `land failed: `, as 279's failed land does. TypeScript prints the same lines on stdout and also exits 1.

## Contract

### Requirement: Land after-land retry

See `specs/rust-land/spec.md`, and the MODIFIED "Land lookup" and "Land after-land command".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-land/spec.md`: MODIFIED "Land lookup", so a landed change runs the retry before its landed line; MODIFIED "Land after-land command", whose last sentence now points to the retry; ADDED "Land after-land retry".
