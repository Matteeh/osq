---
queue_item: confinement-env
queue_hash: sha256:1869be5b41683ad45f60fa84ece42583afed93c472b4a1dd8a4ad4d241cfabb5
planner: null
date: 2026-09-30
---

### Goal

Agent-written code never sees a secret it doesn't need. osq builds each spawned process's environment from an allowlist instead of passing on its own, writes each harness's permission settings as a guardrail, and `osq init` stops scaffolding a harness with its permission checks switched off. ADR 007 records this, and only this: stage 1 of the confinement draft, with no containers yet.

### Context

As of 2026-09-28:

- `runVerificationCommand` in `src/core/run/verification.ts` starts from `{ ...process.env }`. The harness adapters pass `process.env`, or spread it and add `OSQ_TASK_NUMBER` and `OSQ_SPEC_FOLDER`: `claude-exec.ts`, `pi.ts`, `codex.ts`, `agy.ts`, `opencode.ts`, and the default in `src/harness/process.ts`. Every variable in the shell that starts osq reaches the agent and every test it writes.
- `osq init` scaffolds `harness: process.env.OSQ_HARNESS || 'agy'` (`src/core/foundation/init.ts`), its `.env.example` sets `OSQ_HARNESS=agy`, and the agy adapter defaults `dangerouslySkipPermissions` to true.
- `vcs.prepare` runs `pnpm install` through `runPrepare` in `src/core/spec/approve-worktree.ts`, which runs every dependency's install scripts.
- The full confinement design is drafted in Notion under Security, "Confinement ADR". It stays there as direction, not as an ADR. On 2026-09-30 the human chose an ADR per stage: this item writes ADR 007 for stage 1 only, and each later stage gets its own ADR when it's planned. The draft's roles are prepare, agent, verify and planner, and its decision 1 says verify never gets the model API key.
- `decisions/` holds ADRs 001 to 006. None covers confinement. ADR 003 says enforcement needs a sandbox, and ADR 006 decision 7 sets the target as a server driven by an app.
- The old roadmap's "safer defaults" item is folded in here.

### Requirements

- Each role osq spawns (prepare, the agent, and verify with its focused runs and mutation checks) gets an environment built from an allowlist: the variables every process needs, the ones osq sets, and the names the project lists for that role in config. Nothing else is inherited.
- The agent role gets the model API key its harness needs. Verify never does.
- A variable the project's tests need is declared by name in config and passed only to verify.
- Each harness adapter writes that harness's own permission settings for the agent where it has them: deny git, deny network tools, and deny or ask for destructive commands. For a harness without them, `osq doctor` says so.
- `osq init` no longer scaffolds a harness with its permission checks disabled.
- `osq doctor` reports how contained each role is.
- `decisions/007-*.md` is accepted, written by a task in this change. Its rule is close to "Each role osq spawns gets only the environment it declares; verify never gets the model key, and harness permissions are a guardrail." It names the roles and fixes the per-role config block, says what stage 1 does not defend against (files the user can reach, any network host), says how it serves ADR 006, and claims nothing about containers or the network. The rule reaches AGENTS.md's generated block.

### Decide before planning

- The base allowlist, for example `PATH`, `HOME`, `LANG`, `TERM` and `TMPDIR`.
- The per-role config block. It must take stage 2's mounts, network hosts and limits later as new fields beside `env`, for example `confinement.roles.<role>.env: [...]`, never a flat key like `verifyEnv`.
- Which harness `osq init` picks. The old roadmap suggested the most contained harness installed, printing what it chose and why.
- Whether agy runs headless without the bypass flag or stalls waiting for approvals.

### Non-goals

- Containers, the network allowlist, and resource limits. Those are the confinement draft's stages 2 and 3, each with its own ADR later.
- Confining a planner osq runs. That's stage 4.
- Accepting the full confinement draft, or any rule about server mode.

### Notes for planning

- Research each harness's permission settings before writing tasks: Claude Code's settings, Codex's sandbox modes, opencode's agent permissions, pi, and agy.
- Check that this repository's `pnpm verify` still passes with only the allowlist.
- Probably two changes: the ADR, the environment and permission settings first, then the init default and the doctor report.
- The ADR is a task inside the change, never a hand edit, so lint and the watcher check it.
