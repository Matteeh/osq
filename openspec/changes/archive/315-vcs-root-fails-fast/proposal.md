---
title: With git on, a project root that is not its repository's top level fails every command
depends_on: []
verify: node -e "const {execSync}=require('node:child_process');for (const c of ['pnpm verify','sh scripts/verify-rust.sh']) execSync(c,{stdio:'inherit'})"
features:
  reads: [rust-core, rust-config, rust-storage, rust-archive, rust-inbox, rust-land, rust-lint, rust-plan, rust-report, rust-retry, rust-run, rust-show]
---
## Goal

On 2026-10-22 a Rust approve test ran in a scratch folder under `target/`
that was no repository of its own. Git found the enclosing osq repository,
and the test's fixture change `001-alpha-twice` was approved into the real
repo, where the watcher ran it. Today both languages quietly treat such a
root as "no git": TypeScript's `selectVcs` gives `NoVcs` with reason
`not the repository root`, and each Rust feature has its own check, some
of which (archive's lookup, plan's trees) read the enclosing repository's
worktrees anyway.

This change makes a misplaced root stop at once. With `vcs.enabled` on,
a project root inside a repository but not its top level fails every
command that reads or writes git, before it writes anything, with one
message in both languages:

`<root> is inside the git repository at <top> but is not its top level; run osq from <top> or set vcs.enabled to false`

`<root>` and `<top>` are real paths, symbolic links resolved. TypeScript
throws it from `selectVcs`, which every command already goes through, and
the command line prints it as `Error: <message>` when no command wraps it.
Rust adds one vcs kernel function, `project_git_root`, and every feature
that touches git calls it right after loading `osq.toml`, in place of its
own root check.

## Verify

`node -e "..."` runs `pnpm verify` and then `sh scripts/verify-rust.sh`,
stopping at the first that fails. Together they run both typechecks, the
build, every TypeScript test and lint, then the Rust format check, clippy,
every Rust test, the link gates and the mutation check of the changed Rust
lines. They prove, on scratch repositories, that each command run from a
folder below the top level refuses with the message and leaves the
repository untouched, that the kernel function gives each outcome its
table names, and that every earlier test still holds.

## Non-goals

- Doctor checks for orphan `osq/*` branches.
- Changing what happens outside any repository, or with `vcs.enabled` off:
  both stay "no git" as today.
- Commands that never read git, such as `spec`, `query` and `queue`.

## Surface

- Changed: every command that reads or writes git (TypeScript and Rust), with `vcs.enabled` on and a project root below its repository's top level: fails with `<root> is inside the git repository at <top> but is not its top level; run osq from <top> or set vcs.enabled to false`
- Changed: `osq doctor`: fails with that message in the same case, where it warned `git: not the repository root; git checks off`; with `vcs.enabled` off it still warns

## Decisions

- ADR 001: config loading is unchanged.
- ADR 003: the refusal comes before any git write, so a misplaced root never writes the enclosing repository.
- ADR 004: the OpenSpec validator is unchanged.
- ADR 005: the validator peer range is unchanged.
- ADR 010: the validator role is unchanged.
- ADR 012: a watcher started below a repository's top level now fails its tick loudly; the supervisor's backoff is unchanged.
- ADR 015: MCP tools reach the same command functions and refuse the same way.
- ADR 018: the steering planner is unchanged.
- ADR 019: a tapped planner's `osq plan` refuses like every command.
- ADR 021: autopilot is unchanged; its commands refuse like every command.
- ADR 022: each feature calls the vcs kernel's one function; no feature calls another.
- ADR 023: the root comparison is a pure leaf in the kernel; features only map its error to their command's failure.
- ADR 024: `project_git_root` ends its doc with `Implements: rust-vcs/project-root-check`, and each new test names its `Covers:` scenario.
- ADR 025: no on-disk format changes; the message is TypeScript's text.
- ADR 026: no OpenSpec parsing changes.
- ADR 027: no scheduling changes.
- ADR 028: no command is added or renamed.
- ADR 029: the check reads `vcs.enabled` and `timeouts` from `load_config`'s typed values.

## Assumptions

- With git on, a missing git program or a failed `rev-parse` still means "no git", as TypeScript's `selectVcs` decides; Rust features that failed on a git spawn error at that first read (land, run, inbox, retry) now say their "needs git" text or work in the checkout instead.
- Doctor failing outright, rather than printing a `[fail] git:` line among its other checks, is acceptable: the message itself says what is wrong and how to fix it.
- The four Rust tests that proved the old quiet fallback (approve, lint, report, show) may be rewritten: approve's keeps its scenario with `vcs.enabled` off, and the other three now assert the refusal. A measured run of every test with a rough version of the change found no other test relying on the fallback.

## Contract

### Requirement: Nested project roots fail

See `specs/version-control/spec.md`, "Vcs selection", with "Folder below
the root with git on" and "Commands below the root with git on";
`specs/cli-foundation/spec.md`, "Config error exit";
`specs/rust-vcs/spec.md`, "Project root check"; `specs/rust-approve/spec.md`,
"Worktree approval"; and `specs/rust-doctor/spec.md`, "Doctor git checks".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/version-control/spec.md`: MODIFIED "Vcs selection", with two new scenarios.
- `specs/cli-foundation/spec.md`: MODIFIED "Config error exit", with one new scenario.
- `specs/rust-vcs/spec.md`: ADDED "Project root check".
- `specs/rust-approve/spec.md`: MODIFIED "Worktree approval"; its "Git off approves in the checkout" scenario now turns `vcs.enabled` off.
- `specs/rust-doctor/spec.md`: MODIFIED "Doctor git checks".
- No file is shared by two tasks. Tasks 3 to 7 each prove their own rows of rust-vcs "Every git command refuses a nested root".
