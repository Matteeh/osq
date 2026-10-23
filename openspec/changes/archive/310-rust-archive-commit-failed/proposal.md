---
title: Rust archive and land handle a failed archive commit as TypeScript does
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-config, rust-vcs, rust-storage]
---
## Goal

302 made TypeScript record a failed worktree archive commit, make it on
`osq retry <id> change`, and have land name that retry. Rust archive (295)
fails loudly but records nothing, Rust retry would make a `land retry`
commit that leaves the archive uncommitted, and Rust land lists the
uncommitted paths. This change makes the three Rust features write and
read TypeScript's record, so either language can pick up the other's
change:

- `archive` writes `.run/regressed/change.md` and a `regressed` event with
  reason `commit_failed` and git's output, uncommitted, and still fails.
- `retry <id> change` on that record makes the archive commit.
- `land` refuses such a change and names the retry.

While building the goldens, TypeScript's retry turned out to fail on this
fixture even with the hook gone: it undoes the staged deletion of the old
change folder only, so `git add` refuses a deleted living spec file
(`fatal: pathspec 'openspec/specs/beta/osq.yml' did not match any
files`). The Rust retry puts back and removes every deleted path itself.
A queue item fixes TypeScript the same way.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints, every Rust test, the link gates and the mutation check of the
changed lines. It proves, on scratch repositories with a failing
`pre-commit` hook, that the archive record equals TypeScript's, that a
retry commits the archive or puts the record back, that land refuses with
TypeScript's text, and that every earlier archive, retry and land test
still holds.

## Non-goals

- The watcher's catch-up pass; it belongs to the Rust loop.
- `osq show`, the inbox and the dispatcher offering the retry in Rust.
- `osq sync` and `osq message` on such a change.
- The TypeScript retry fix; it is its own queue item.

## Surface

- Changed: `osq archive <id>` (Rust command): a failed worktree archive commit leaves a `commit_failed` record
- Changed: `osq retry <id> change` (Rust command): on that record, it makes the archive commit
- Changed: `osq land <id>` (Rust command): refuses a change whose archive commit failed and names the retry

## Decisions

- ADR 003: osq alone makes the missing commit, through `osq retry`; no human runs git.
- ADR 022: each feature crate does its own part; retry copies the archive commit's path selection and message rather than calling the archive feature, and nothing reads another feature's files at runtime.
- ADR 023: the record text, the tail and the path selection are pure leaves; the commits and file writes stay in thin orchestrators.
- ADR 024: every public item ends its doc with `Implements: <capability>/<requirement>`, and each new test names `Covers: <capability>/<scenario>`.
- ADR 025: the marker, the `regressed` and `retry` events and the commit message are TypeScript's bytes.
- ADR 026: no OpenSpec parsing changes.
- ADR 027: no scheduling changes.
- ADR 028: the three features' commands are unchanged.
- ADR 029: the record's tail sizes come from `load_config`'s `limits`.

## Assumptions

- The archived folder's `.run/approved` still matches its seal after a failed archive, as TypeScript's retry passed the approval check on this fixture.
- After a refused retry, leaving the record staged (`A `) rather than untracked is fine; the vcs kernel has no unstage call until 301's `discard` lands, and the next retry reads the same files.

## Contract

### Requirement: Archive commit failure

See `specs/rust-archive/spec.md`, "Worktree archive";
`specs/rust-retry/spec.md`, "Archived retry", with "Failed archive commit
retried" and "Failed archive commit retry refused"; and
`specs/rust-land/spec.md`, "Land refusals", with "Land on a failed archive
commit".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-archive/spec.md`: MODIFIED "Worktree archive"; its "Worktree archive commit fails" scenario now compares with this change's golden.
- `specs/rust-retry/spec.md`: MODIFIED "Archived retry", with two new scenarios.
- `specs/rust-land/spec.md`: MODIFIED "Land refusals", with one new scenario.
- `golden/print-archive-commit-failed-goldens.mjs.txt` printed `golden/archive-fails-007.txt` from TypeScript's `dist`.
- No file is shared by two tasks.
