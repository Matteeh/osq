---
queue_item: rust-adr-parse
queue_hash: sha256:cc18b12e1750ad9f99e78cbaa57803f1e839f95204676f983c5b1dd510211968
planner: null
date: 2026-10-20
---

### Goal

The ADRs are the first nodes of ADR 024's link graph, so Rust needs to read them the way TypeScript does.

### Context

As of 2026-10-19:

- `decisions/` holds 26 accepted ADRs and 1 superseded one, plus `README.md`. TypeScript reads them in `src/core/foundation/decisions.ts` (`readDecisions`, the `Adr` interface: number, title, date, path, hash, status, appliesTo, governs, rule, supersededBy, checks, denies, malformed), resolves `group:<name>` through capability sidecars in `decisions-groups.ts`, and validates them in `decisions-validate.ts`.
- ADR 024 section 1 adds an `enforced_by` frontmatter field for an ADR that a structural rule or the validator enforces. No ADR uses it yet.
- The specs kernel (`crates/kernel/specs`, rust-specs) already parses frontmatter, sidecars and Code ownership. Each capability's `osq.yml` carries its `group`.

### Requirements

- The specs kernel reads every `decisions/*.md` ADR into a core type with TypeScript's fields plus `enforced_by`, and resolves `applies_to` groups to capabilities from the sidecars.
- It reports the problems `validateDecisions` reports, each with the file and a fix.
- A golden test compares the parse of every ADR in `decisions/` with JSON printed once by `readDecisions` and committed as fixtures. The test never runs node.
- Fast tests on the crate's own fixtures cover each field, a malformed list, a group and a superseded ADR.

### Non-goals

- Any check that an ADR is enforced; that is `rust-link-gates`.
- Changing an ADR or the TypeScript reader.
