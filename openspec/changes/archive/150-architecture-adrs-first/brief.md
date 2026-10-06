---
queue_item: architecture-adrs-first
queue_hash: sha256:419634b5d827b2e94196da7ee48fa6d91e65835a78064ffa67b94bc9b7aa2ada
planner: null
date: 2026-10-05
---

### Goal

`osq init` and the planner guidance steer a new project to write its architecture and style ADRs first, before its first feature change, because those decisions shape every task an executor runs more than any technology choice does.

### Context

As of 2026-10-04:

- ADRs already carry what osq needs: frontmatter with `status`, `applies_to`, a one-sentence `rule`, `checks` and `denies` (`decisions/README.md`). A proposal's `## Decisions` names the ADRs that govern the capabilities it writes, and the AGENTS.md rules block carries every `applies_to: all` rule to executors.
- `osq init` (`scaffoldProject` in `src/core/foundation/init.ts`) creates `openspec/` folders, `osq.config.ts`, `.env.example`, and the AGENTS.md and PLANNER.md managed blocks. It creates no `decisions/` folder and no ADR, and the managed PLANNER block never tells a planner to start with ADRs.
- `osq doctor`'s `decisions` check (`src/core/foundation/doctor-decisions.ts`) is skipped when a project has no decisions file, so a project with no ADRs gets no notice at all.
- osq's own rules show what an architecture ADR covers beyond technology: thin CLI and logic in core, the filesystem is the protocol, fixed writers, no numbers in code, one file per capability folder. Executors follow these because they are written down.
- An ADR rule with `checks` is enforced by a test. One with only a `rule` is enforced by nothing; a later validator step (after `validator-observe`) may judge those.

### Requirements

- `osq init` creates `decisions/` with a README describing the ADR format, and a starter ADR with `status: proposed` that asks how the project is built: layering and where logic lives, where state lives, error handling, test style, and naming. It is owned by the project after copy, like the other templates, and never overwritten.
- The managed PLANNER block says that a project's first changes write its architecture and style ADRs, `applies_to: all`, with a `rule` sentence each, and a `checks` test where the rule can be tested.
- `osq doctor` warns when a project has no accepted ADR with `applies_to: all`. A warning only; it never fails doctor.
- The README's getting-started section shows the same order: init, write the architecture ADRs, then the first feature brief.

### Non-goals

- Any gate that blocks a change for missing ADRs.
- Judging code against ADR rules; that is a later validator step.
- Writing osq's own ADRs again or changing any accepted ADR.

### Notes for planning

- Keep the starter ADR short: headed questions, not prescribed answers. osq knows nothing about the consumer's stack.
- The doctor warning follows ADR 006 decision 4: record what it measures, or drop it if it only nags.
