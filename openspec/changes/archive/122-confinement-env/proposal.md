---
title: Agents and verify get only the environment they need, and osq init scaffolds a contained harness
depends_on: ["108"]
verify: pnpm verify
features:
  reads:
    - spec-lint-and-approve
    - version-control
    - metrics-and-reporting
    - status-inspection
    - traceability
---
## Goal

Every process osq starts inherits osq's whole environment. The agent, every
test the agent writes, and `vcs.prepare`'s dependency install scripts all see
every variable in the shell that started osq: cloud credentials, registry
tokens, and the model API key.

After this change, osq builds each role's environment from an allowlist. The
roles are prepare, agent, and verify. Each gets a small base list, osq's own
`OSQ_` variables, and the names the project lists for that role under
`confinement.roles.<role>.env`. The agent also gets the model key names its
harness reads. Verify and prepare never get those, even when config lists
them. Claude Code and new opencode agent files also deny network tools and
`sudo`, next to the `git` denial Claude already has. ADR 007 records the rule.

This is stage 1 of the confinement draft, with no containers. It is the first
of two changes for the `confinement-env` queue item. The second makes
`osq init` scaffold a contained harness and makes `osq doctor` report how
contained each role is.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests build each role's
environment from a fake source environment. They also run a verify, a
prepare, a watcher task with its change verify and baseline, and each harness
adapter's task spawn with a fake binary, and check which variables each child
sees. This repository's own `pnpm verify` passed on 2026-09-30 with only
`PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `LANG`, `TERM`,
`NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, and `XDG_RUNTIME_DIR` set, so
this repository needs no `confinement` block.

## Non-goals

- Containers, mounts, the network allowlist, and resource limits: the
  confinement draft's stages 2 and 3, each with its own ADR later.
- Confining a planner osq runs, stage 4. Interactive sessions and osq's own
  probes, usage reads, and session exports keep osq's environment.
- The `osq init` harness default, agy's permission bypass, and the `osq
  doctor` containment report. These belong to the second change.
- Rewriting an existing opencode agent file's frontmatter. `osq setup` still
  refreshes only its managed block, so only a newly written file gets the new
  permissions.
- Filtering the environment of osq's own git, OpenSpec validator, or dev
  worker. Those run osq's code, not the project's.
- Accepting the full confinement draft, or any rule about server mode.

## Surface

- Added: `confinement.roles.prepare.env`, `confinement.roles.agent.env`, and `confinement.roles.verify.env` (config keys)
- Changed: verify, focused runs, mutation checks, `osq check`, baseline verify, retry recertification, sync verify, and `vcs.prepare` no longer inherit osq's environment
- Changed: harness task spawns no longer inherit osq's environment
- Changed: Claude tasks also deny `Bash(curl:*)`, `Bash(wget:*)`, `Bash(ssh:*)`, `Bash(scp:*)`, and `Bash(sudo:*)`
- Changed: a newly written opencode executor agent file denies `git`, `curl`, `wget`, `ssh`, `scp`, and `sudo`
- Added: ADR 007 and its rule in AGENTS.md's rules block (document section)

## Decisions

- ADR 001: unchanged. The `confinement` block loads with the rest of `osq.config.ts` through jiti and is validated in `defineConfig`.
- ADR 002: unchanged. Archive's verifies run in the verify role, and archive still merges deltas without a model.
- ADR 004: the OpenSpec validator is osq's own process, so it keeps osq's environment with `OPENSPEC_TELEMETRY=0`.
- ADR 005: unchanged; no validator call moves.

## Background

**Measured fallout.** A rough version of this change, applied in a scratch
worktree on 2026-09-30, failed four test files. Test fakes read control
variables such as `OSQ_FAKE_CLAUDE_RECORD` and `OSQ_FAKE_MODE`. Every `OSQ_`
variable passes through, so the fakes still see them and those tests keep
passing. What is left:

- `tests/claude/exec-adapter.test.ts` deep-equals Claude's argv, deny rules
  included. Task 4 updates it.
- `tests/opencode-setup.test.ts` asserts the executor agent template's
  `bash` permission is `allow`. Task 4 updates it.
- `tests/line-budget.test.ts` fails because `src/core/foundation/config.ts`
  goes over 250 lines. Task 1 keeps it within 250.

**Harness permissions today.** Measured on 2026-09-30:

- Claude already denies `Bash(git:*)` under `--permission-mode dontAsk` and
  loads no web tools.
- Codex's `--sandbox workspace-write` with `network_access=false` already
  makes `.git` read-only and blocks the network. Checked with `codex sandbox`
  0.155.1: `touch .git/probe` gave "Read-only file system" and `curl` could
  not resolve a host. Codex needs no change.
- Pi has no per-command permission settings. It has only a tool allowlist.
- agy runs with `--dangerously-skip-permissions` by default. The second change
  handles that.
- opencode's `run --auto` approves what isn't explicitly denied, so a `deny`
  in the agent file holds.

**Why `OSQ_` passes.** osq owns the prefix. It passes `OSQ_CHANGE`,
`OSQ_TASK_NUMBER`, `OSQ_SPEC_FOLDER`, and the mutation inputs this way, and
test fakes use it for their controls. Nothing secret is expected under it.

**Where the model key names come from.** Each harness catalog entry gains
`agentEnv`, the variables that harness reads for its model provider and its
own configuration. A login stored under `HOME` needs no variable. `HOME` is in
the base list, so it keeps working.

## Contract

### Requirement: Role environments
osq SHALL build the environment of each role it spawns (prepare, agent,
verify) from an allowlist: the base names, every `OSQ_` variable, the role's
configured names, and for the agent the harness's `agentEnv`. Verify and
prepare SHALL NOT get a name in the selected harness's `agentEnv`.

#### Scenario: Secret not listed
- **WHEN** osq's environment holds `AWS_SECRET_ACCESS_KEY` and no role lists it
- **THEN** no verify, prepare, or agent process sees it

#### Scenario: Verify never gets the model key
- **WHEN** the harness is `claude`, `ANTHROPIC_API_KEY` is set, and `confinement.roles.verify.env` lists it
- **THEN** the agent sees it and verify does not

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/watcher-and-harness/spec.md`: adds "Role environments", "Agent role environment", and "OpenCode executor agent permissions"; modifies "Change folder in verify environment" and "Claude permissions and containment".
- `specs/cli-foundation/spec.md`: adds "Confinement configuration" and "Harness agent environment names".

Five tasks, no shared file. Task 2 uses `buildRoleEnv` from task 1. Task 3
uses the options task 2 adds to `runVerificationCommand`, and task 4 uses
`buildRoleEnv`. Task 5 writes ADR 007, whose `checks` names task 1's test,
so it runs last.
