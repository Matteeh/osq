---
queue_item: rust-specs-validate
queue_hash: sha256:e38531a0536b27de8f590fe4e6326cf98164e4b9a5a573c5b1188fbeedd14139
planner: null
date: 2026-10-18
---

### Goal

Rust osq checks a change and the living specs with osq's own strict OpenSpec rules, without the Node CLI.

### Context

As of 2026-10-18:

- ADR 026 section 2 lists the rules: a living spec has Purpose and Requirements sections; every requirement holds SHALL or MUST and has at least one `#### Scenario:` with WHEN and THEN bullets; a delta uses only ADDED, MODIFIED, REMOVED and RENAMED, each well formed; no duplicate requirement or scenario names in a capability; a change has at least one delta; MODIFIED, REMOVED and RENAMED name requirements the living spec has.
- TypeScript gets these from `openspec validate --strict --json` through `src/core/spec/linter.ts` and `src/core/spec/openspec-issues.ts`. Every finding blocks (ADR 006).
- ADR 026 Enforcement asks for a golden corpus: all living specs and archived changes validate, and a fixture set of invalid specs gives the expected finding codes.

### Requirements

- The kernel validates a living spec and a change's delta specs against the living specs, with each rule above. Each finding has a stable code, the file and line, and one fix for the human, in the same shape as osq's other lint findings.
- A fixture set holds one invalid document per finding code, and a test checks each gives its code.
- A corpus test validates every living spec with no finding.

### Non-goals

- Validating the merged result; that needs the merge, in `rust-specs-merge`.
- osq's own lint rules outside OpenSpec, such as scope, verify or Decisions checks.
- Wiring the validator into a Rust lint or approve command.
