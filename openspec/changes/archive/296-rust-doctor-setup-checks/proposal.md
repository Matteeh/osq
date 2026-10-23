---
title: Rust osq doctor checks managed blocks, decisions and git
depends_on: ["289"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-config, rust-specs]
---
## Goal

A human usually runs `osq doctor` first to check the project setup: whether
the managed blocks are current, whether the decisions are in order, and
whether git is ready. Rust doctor already prints the `config` line (276), the
pi lines (276) and the change lines (288), but none of these three setup
checks. TypeScript runs them in `runDoctorChecks`, which calls
`checkManagedBlocks`, `checkDecisions` and `checkGit`. This change gives the
vcs kernel the three git reads `checkGit` needs: git's version, the hook
names and the index line endings. Rust doctor then prints TypeScript's
`managed-blocks` and `decisions` lines before the change lines, and the
`git` lines after them, with TypeScript's text. It fails when the
managed-blocks or decisions line fails.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints and every Rust test, including the corpus link gates and the mutation
check of the changed lines. It proves that the vcs kernel reads git's
version, hook names and line endings as TypeScript's `GitVcs` does. It
proves that doctor prints TypeScript's managed-blocks, decisions and git
lines for a passing case and for each failure or warning. It also proves
that every earlier doctor row still holds, now with the new lines in
TypeScript's order.

## Non-goals

- The validator, languages, planning-price, harness-containment and validator-harness checks.
- The traceability blocks `checkManagedBlocks` also checks. `osq.toml` has no `traceability` key yet, so Rust doctor does not check them.
- The `config` line. Rust doctor already prints it. TypeScript's other failure, `configuration is invalid or incomplete`, cannot happen with a typed `Config`.
- Writing or repairing any file. Doctor only reports, and `osq init` and `osq setup` stay TypeScript's.

## Surface

- Changed: `osq doctor` (Rust) prints the `managed-blocks` line and, when the project has decisions, the `decisions` line between its pi lines and its change lines. After the change lines it prints the `git` line and, when they apply, the `vcs-prepare`, `git-hooks`, `git-signing`, `gitattributes`, `git-line-endings` and `git-env` warnings.

## Decisions

- ADR 022: doctor reads git only through the vcs kernel's `Vcs` reads, three of them new, and ADRs only through the specs kernel. It reads the project's own setup files, such as `AGENTS.md`, itself, and depends on no feature crate.
- ADR 023: every line is a pure function of facts the orchestrator gathers. Only the orchestrator and its readers touch files, git and the environment.
- ADR 024: every public item ends its doc with `Implements: rust-vcs/<requirement>` or `Implements: rust-doctor/<requirement>`, and each test names `Covers: <capability>/<scenario>`.
- ADR 025: doctor reads today's `AGENTS.md`, `PLANNER.md`, the Claude command, `decisions/` and `.gitattributes` as TypeScript writes them, and writes no file.
- ADR 026: ADRs are read and validated only through rust-specs `read_decisions` and `validate_decisions`.
- ADR 027: no scheduling changes.
- ADR 028: `DoctorFeature` keeps its one command, its summary and its refusals.
- ADR 029: `maxRuleLength`, `maxProjectRules` and `maxListedLineEndings` come from rust-config's `Limits`, which 289 adds. The `decisions` and `openspec` folders and the opencode agent `osq-coder` are TypeScript's defaults, held as named constants, because `osq.toml` has no `paths` or `opencode` key.

## Assumptions

- 289 is archived but not landed, and this change reads its `Limits`, so it depends on 289 and stacks on it until 289 lands.
- The three canonical managed blocks in `golden/` come from today's TypeScript build, which matches the source: TypeScript doctor on this repository reports `managed blocks valid`. When TypeScript changes a block, the Rust copies need a change too.
- Rust `validate_decisions` also reports a malformed `enforced_by`, which TypeScript does not read. That is the one way the Rust decisions line can differ from TypeScript's.
- The doctor tests that run in process read the user's global git config. A global `commit.gpgsign` or `core.hooksPath` would add warning lines to the worktree rows. This machine sets neither, and the new git rows run in a child process with global and system config turned off.
- The test process has no `GIT_DIR`, `GIT_INDEX_FILE` or `GIT_WORK_TREE` set.
- Names are sorted in byte order. TypeScript sorts by UTF-16 code units, and the two orders differ only for characters outside the Basic Multilingual Plane.
- This change and 292 both write `crates/kernel/vcs/src/port.rs` and `crates/kernel/vcs/src/git.rs`, so the scheduler runs them one after the other.

## Contract

### Requirement: Setup checks

See `specs/rust-vcs/spec.md`, with "Setup reads", and
`specs/rust-doctor/spec.md`, with "Doctor command", "Doctor pi checks",
"Doctor change checks", "Doctor managed blocks", "Doctor decisions" and
"Doctor git checks".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-vcs/spec.md`: ADDED "Setup reads".
- `specs/rust-doctor/spec.md`: MODIFIED "Doctor command", "Doctor pi checks" and "Doctor change checks"; ADDED "Doctor managed blocks", "Doctor decisions" and "Doctor git checks".
- `golden/agents-block.txt`, `golden/planner-block.txt` and `golden/claude-plan-command.txt` are TypeScript's `MANAGED_AGENTS_MD_BODY`, `MANAGED_PLANNER_BLOCK` and `MANAGED_CLAUDE_PLAN_COMMAND`, printed from `dist/` with no trailing newline. Task 2 copies them byte for byte into the crate's source and test fixtures.
- Tasks 2 and 3 share `crates/features/doctor/src/doctor.rs`. Task 3 adds the decisions call to the orchestrator after task 2 is done.
