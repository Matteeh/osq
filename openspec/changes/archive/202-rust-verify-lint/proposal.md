---
title: Verify lint accepts cargo commands and gives chain advice that fits a Rust project
depends_on: []
verify: pnpm verify
features:
  reads:
    - status-inspection
    - watcher-and-harness
---
## Goal

A Rust project's task verify, such as `cargo test -p core --test parse`, lints
clean, and the chained-verify error tells a Rust project what to do instead of
naming package scripts it doesn't have. Today every `cargo` command draws the
"names neither an existing repository path nor a package script" warning, and
a chained verify is told to move into a package script even where there is no
`package.json`. After this change the Rust preset names `cargo` and its
subcommands as data, lint recognizes them in a project whose language map
holds Rust, the chain refusal suggests a script file when the root has no
`package.json`, and the coverage list says verify-command lint covers Rust.

## Verify

`pnpm verify`

The CLI and UI typechecks, the build, every test and lint pass on the final
tree, including the two new test files: one proves the preset's verify runners,
the other lints temporary projects with a root `Cargo.toml` or `package.json`.
No test needs `cargo`.

## Non-goals

- Checking that a named test target, package or binary exists.
- Toolchain and global flags before the subcommand, such as `cargo +nightly test` or `cargo --locked test`; they still warn.
- Runners for TypeScript, Python or Go; TypeScript keeps its package-script recognition, and the others gain no runners.
- The proposal-level verify's chain handling, which is unchanged.

## Surface

- Changed: the chained-verify lint error suggests `scripts/verify.sh` when the project root has no `package.json`.
- Changed: the `languages` `osq doctor` check no longer lists `verify-command lint` for Rust.

## Decisions

- ADR 001: config loading is untouched.
- ADR 004: the OpenSpec validator invocation is untouched.
- ADR 005: the peer range rule is untouched.
- ADR 010: the validator role is untouched.
- ADR 012: the watch service is untouched.
- ADR 015: `osq mcp` is untouched.
- ADR 018: the steering planner is untouched.
- ADR 019: the tapped planner is untouched.
- ADR 021: autopilot is untouched.
- ADR 017: `cargo` and its subcommands are Rust preset data (decision 2); lint finds Rust through the project's language map (decision 1); matching a command against runner data is not language-specific, so no adapter method is added (decision 5); the coverage list moves because verify-command lint now covers Rust (decision 4).

## Assumptions

- Lint finds Rust from `readLanguageMap`: tracked `Cargo.toml` files anywhere, plus a root one. A change that creates the project's first `Cargo.toml` still gets the unresolved-target warning on its cargo verifies. It is a warning, so approval is not blocked.
- The script-file advice depends only on whether the project root holds `package.json`. A repository with a root `package.json` and a Rust crate below it, such as osq building its Rust rewrite, keeps the package-script advice.
- Measured on 2026-10-17: a prototype of both tasks in a scratch worktree typechecked and passed biome. The full suite failed only `tests/languages-map.test.ts`, `tests/doctor-languages.test.ts` (task 1) and `tests/lint-findings.test.ts` (task 2), plus the tests that need a build.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/languages/spec.md`: MODIFIED "Language presets and coverage" (verify runners column, `verifyRunners`, verify-command lint covers Rust, new scenario "Verify runners of the languages").
- `specs/spec-lint-and-approve/spec.md`: MODIFIED "Verify-command trust validation" (recognized verify runners, new scenario "Cargo verify"), "Chained verify refusal" (script-file advice without `package.json`, new scenario "Chained verify without package.json").
- `specs/cli-foundation/spec.md`: MODIFIED "Languages doctor check" (scenario message).

No file is shared between tasks. Task 2 reads `verifyRunners` from task 1's `src/kernel/languages/presets.ts` without changing it.
