---
queue_item: capability-pages
queue_hash: sha256:5d136d10d92b71a1b0d3553717f5e2a2aaf2058ccfde6158ae07291cfe8a5ded
planner: null
date: 2026-10-11
---

### Goal

A new developer, human or agent, can open one page per capability and one per ADR, on the dashboard or as generated Markdown, and know what the capability promises, which decisions bind it, where its code and tests live, and what changed in it lately. The pages come from the living specs and the ADRs, so they cannot drift.

### Context

As of 2026-10-10 (Notion: DOCS FEAT > "Docs ONBOARDING", the `docs-onboarding` brief from 2026-09-28):

- Living specs are `openspec/specs/<capability>/spec.md`, each with a Code ownership requirement and an `osq.yml` group. `osq spec <capability>` lists requirements and `osq spec <capability> <requirement>` prints one.
- `src/core/foundation/decisions.ts` reads ADR frontmatter (status, `applies_to`, rule).
- `/api/system` (`src/core/web/system-graph.ts`) returns requirements, scenarios, ADRs, changes and traceability links, but no ADR full text. The dashboard does not read it; `osq graph` prints it.
- `osq digest` (130) reads the archive by date or id; `osq query`'s `requirements` table says which changes touched which requirement.
- Traceability links exist only for opted-in capabilities (`traceability` today).
- The dashboard has home, changes, change detail, approve, land and report views, served under `/p/<project>/` on a server.

### Requirements

- One page model per capability: its spec's opening text, each requirement's SHALL sentence with its scenario names, the accepted ADRs that apply to it or to all with their rules, its Code ownership, a code map from traceability for opted-in capabilities, and the last five changes that touched it with id, date and goal sentence.
- One page model per ADR: frontmatter, full text, and the capabilities it applies to. Superseded ADRs are marked and link to their successor.
- The dashboard shows both, with a list of capabilities by group and of ADRs, at phone width.
- `osq docs [--out <dir>]` writes the same models as Markdown, one file per capability and per ADR plus an index, byte-identical for the same inputs, writing nothing outside `--out`.

### Non-goals

- Prose written by a model (`docs-narration`).
- API reference from types.

### Notes for planning

- Build the model once and render it twice; reuse the ADR reader, the spec parser and the archive reader rather than parsing again.
- This is large. Split it into tasks by page model, then dashboard, then `osq docs`, and consider a second change for `osq docs` if the plan grows past six tasks.
- The `osq-traceability-vision.md` fixture the old brief named is not in the repository; use osq's own `traceability` capability.
