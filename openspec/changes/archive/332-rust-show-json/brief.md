---
queue_item: rust-show-json
queue_hash: sha256:4271eccfe7f0bf44feab48a3b252eda3d353add91186821a13de8ecbecf8b0af
planner: null
date: 2026-10-24
---

### Goal

`osq show <id> --json` is how tools and agents read one change. Rust `show` prints only the text view and refuses `--json`. Port the JSON view.

### Context

As of 2026-10-24:

- TypeScript: `formatShowJson` in `src/core/status/show-output.ts`, from the same `SpecDetails` the text view uses (`src/cli/show.ts`).
- Rust `crates/features/show` derives the text view's facts: status and next step, dependency readiness, git state and land lines.

### Requirements

- Rust `osq show <id> --json` prints TypeScript's JSON byte for byte for checkout, worktree and archived changes, with vcs on and off.
- It reuses show's derivations rather than copying them.
- Tests compare with TypeScript's `dist` on fixture projects.

### Non-goals

- `osq status --json`; TypeScript has none.
