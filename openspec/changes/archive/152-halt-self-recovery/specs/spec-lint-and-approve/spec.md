## ADDED Requirements

### Requirement: Approve from a worktree
Before it loads anything else, `approveCommand` in `src/cli/approve.ts` SHALL
pass its `cwd` to `resolveCheckoutRoot` in `src/core/vcs/checkout-root.ts`.
When `vcs.enabled` is on, git is selected, the git root of `cwd` is a linked
worktree whose HEAD is on a branch starting with `osq/`, and the main entry of
`worktreeList()` is another path, `resolveCheckoutRoot` SHALL return that main
path; otherwise it SHALL return `cwd` unchanged. When the result differs from
`cwd`, `approveCommand` SHALL print `Approving from the checkout <path>` to
stderr and then run exactly as if `cwd` were that path, loading that path's
configuration unless a config was passed in.

#### Scenario: Approve run inside a change's worktree
- **WHEN** change `001` runs in its worktree, a human writes change `002` in the checkout, and runs `osq approve 002` with `cwd` inside `001`'s worktree
- **THEN** stderr holds `Approving from the checkout <checkout>`, `002` is approved as from the checkout, and nothing is written in `001`'s worktree

#### Scenario: Steering approved from its own worktree
- **WHEN** a change that needs steering has its plan edited in its worktree and `osq approve <id>` runs with `cwd` in that worktree
- **THEN** approval succeeds as "Approval after steering" says, with no lint finding about existing test files

#### Scenario: Checkout or other worktree
- **WHEN** `cwd` is the checkout, or a linked worktree on a branch not starting with `osq/`
- **THEN** `resolveCheckoutRoot` returns `cwd` and nothing is printed

## MODIFIED Requirements

### Requirement: Approval flags
The digest SHALL raise `shared_file` for task pairs whose resolved scopes share
a path, `sensitive_path` for resolved scope paths that are package manifests,
lockfiles, CI workflows, `osq.config.*`, OpenSpec config, managed instruction
files, or env files, `verify_without_test` for a verify naming no test file or
runner, `removed_requirement` for removing deltas, `unknown_capability` for a
delta capability with no living spec that is not deliberately created, and
`verify_starts_conflict` for each verify start contradiction.

#### Scenario: Shared file
- **WHEN** tasks 1 and 2 both resolve `src/a.ts`
- **THEN** one `shared_file` flag labelled `shared files in tasks 1 and 2` reads `src/a.ts; when task 2 changes them, the watcher re-runs task 1's verify and halts only if it fails`

#### Scenario: Env file templates
- **WHEN** a scope resolves `.env.example`, `.env.sample`, or `.env.template`
- **THEN** no `sensitive_path` flag fires for that file, while `.env` and `.env.local` do fire

#### Scenario: Verify with a runner
- **WHEN** a verify is `pnpm verify` or `node --import tsx --test tests/a.test.ts`
- **THEN** no `verify_without_test` flag fires for it, while `npx tsc --noEmit` fires one

#### Scenario: Approval line
- **WHEN** two flags fire and approval proceeds
- **THEN** each flag prints on its own line after the digest and the approval line reads `Approved <id> (<folder>) with 2 flags: <label>, <label>`

#### Scenario: Verify start conflict
- **WHEN** a task declares `any` or `green` and its verify names a missing test inside its own scope
- **THEN** one `verify_starts_conflict` flag labelled `verify starts conflict in task <n>` names the path and the declared start, and the same task declaring `red` raises none
