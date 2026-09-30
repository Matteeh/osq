---
status: accepted
applies_to: all
rule: Each role osq spawns gets only the environment it declares; verify never gets the model key, and harness permissions are a guardrail.
checks:
  - tests/confinement-env.test.ts
---
# 007. Role environments

Date: 2026-09-30

## Status

Accepted

## Context

osq runs code it did not write. The agent is a model with a shell. Verify, focused runs, and mutation checks run tests the agent wrote. `vcs.prepare` runs `pnpm install`, which runs every dependency's install scripts. Until now each of them inherited osq's whole environment, so every variable in the shell that started osq reached them: cloud credentials, registry tokens, and the model API key.

A fuller confinement design, with containers, a network allowlist, resource limits, and a confined planner, is drafted separately. It is not accepted here. This ADR is its first stage only, and each later stage gets its own ADR when it is planned.

## Decision

### 1. osq spawns three roles

| Role | Runs | Gets beyond the base |
|---|---|---|
| prepare | `vcs.prepare` | what the project lists for prepare, such as a registry token |
| agent | the harness process for a task | its harness's model key names, and what the project lists for the agent |
| verify | task, change, archive, and regression verifies, focused runs, mutation checks, the baseline, and `osq check` | what the project lists for verify, such as a test database URL |

A planner osq runs is not a role yet. It, interactive sessions, and osq's own probes and exports keep osq's environment until the planner stage.

### 2. Each environment is built from an allowlist

Nothing is inherited. osq copies only a fixed base list (`PATH`, `HOME`, the user and shell, locale, temp folders, XDG folders, certificate paths, `CI`, `NO_COLOR`, and the variables Windows needs), every `OSQ_` variable, which osq owns, and the names the role declares. A name that is unset is left out.

### 3. Verify never gets the model key

The agent needs its key to reach its model. Its tests do not, and anything verify can read, the agent can read one step removed. So verify and prepare leave out every name the selected harness reads for its model, even when the project lists it for them. A project whose tests call a model uses a variable of its own.

### 4. One config block, keyed by role

```ts
confinement: {
  roles: {
    prepare: { env: ['NPM_TOKEN'] },
    agent: { env: [] },
    verify: { env: ['DATABASE_URL'] },
  },
}
```

Later stages add fields beside `env` in the same role, such as mounts, network hosts, and limits. They never add a flat key such as `verifyEnv`. An unknown role or field fails config validation.

### 5. Harness permissions are a guardrail

osq writes the harness's own permission settings where it has them. Claude Code denies `git`, `curl`, `wget`, `ssh`, `scp`, and `sudo`. A new opencode agent file denies the same. Codex's workspace-write sandbox already keeps `.git` read-only and the network off. These catch mistakes early and give clear errors. They are not a boundary, because a shell can go around any pattern list.

## What stage 1 does not defend against

- **Files the user can reach.** The agent and its tests can read and write anything the user running osq can, including credential files under `HOME`.
- **Any network host.** Nothing limits where a process connects, beyond what a harness sandbox enforces.
- **Secrets in files.** A `.env` file in the worktree is readable by everything that runs there.
- **Runaway resource use.** A fork loop or memory leak is bounded only by osq's timeouts.

## How it serves ADR 006

Building each environment is a deterministic step, and osq owns it: the same config gives the same environment every time, and no human assembles one. A server run has no human watching, so what a process can reach must be decided before it starts, and this is the first part of that.

## Consequences

- A project whose tests or install need a variable must list it under its role. After upgrading, such a project's verify or prepare fails until it does.
- A harness that needs a variable osq's catalog does not list, such as cloud credentials for a hosted model, needs it listed under `agent`.
- Test fakes and tools that talk to osq through `OSQ_` variables keep working.

## Rejected

- **A denylist of secret-looking names**, such as names containing `KEY`, `SECRET`, or `TOKEN`. It misses every secret with another name.
- **Letting config remove base names.** Nothing in the base list is secret, and removing `PATH` or `HOME` only breaks tools.
- **One environment for all roles.** Verify would see the model key, and the agent would see prepare's registry token.
