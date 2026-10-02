---
queue_item: pi-default-harness
queue_hash: sha256:2f2d820c42cb2742ce484479caf4e9cbec5790c6bf5c790bc299df9320e0420f
planner: null
date: 2026-10-02
---

### Goal

`osq init` scaffolds pi as the default harness instead of codex, and the docs say so.

### Context

As of 2026-10-02:

- Change 137 (safer-harness-defaults) turns agy's permission bypass off by default, adds `harness-containment` to `osq doctor` for every harness, and scaffolds `harness: process.env.OSQ_HARNESS || 'codex'` and `OSQ_HARNESS=codex` (`src/core/foundation/init.ts`, `.env.example`, `templates/.env.example`). It picked codex for its sandbox. The human chose pi afterwards: it runs any command headless, needs no generated files, reads `AGENTS.md` itself, and is what this repository runs.
- Pi has no permission prompts and no sandbox. 137's doctor line for pi says so as a passing check, not a warning.
- The confinement draft in Notion (ROADMAP > Security, "Confinement ADR") makes a container per role the boundary from its stage 2 on, and harness permissions only a guardrail. So the default harness is not where confinement comes from.
- A prototype on 2026-10-02 with pi scaffolded failed only `tests/codex-guidance.test.ts`, which pins the scaffolded default, and `tests/config-load-errors.test.ts`, which swaps the scaffold's harness for `'codex'` by string replace. The living requirement "Config file errors" describes that swap in its "Scaffolded config without node_modules" scenario.

### Requirements

- `osq init` writes `harness: process.env.OSQ_HARNESS || 'pi'` in `osq.config.ts`, and `.env.example` starts with `OSQ_HARNESS=pi`. The repository's `.env.example` and `templates/.env.example` match the scaffold.
- The Codex guidance comments in `.env.example` stay, so codex remains one `OSQ_HARNESS=codex` away.
- README's Pi section says pi is the scaffolded default and that nothing confines its agent. The Upgrading notes and CHANGELOG replace 137's codex wording with pi.
- `DEFAULT_CONFIG.harness` stays as 137 leaves it.

### Non-goals

- Containers or any confinement stage after ADR 007's stage 1.
- Making doctor warn about pi.
- Scaffolding a `pi` config block with a provider or model.

### Notes for planning

- The scaffolded default is consumer-visible; list it in Surface.
- Read 137's archived proposal first: its Background records the agy probe and the measured fallout.
