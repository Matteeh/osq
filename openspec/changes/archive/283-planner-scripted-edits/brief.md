---
queue_item: planner-scripted-edits
queue_hash: sha256:f21ee050ea367de1396c56301e728f7237c9a75eee3416b65155f349e659c901
planner: null
date: 2026-10-22
---

### Goal

The planner rule "Write files with the file tool, never through a shell echo." bans every scripted write. It came from 029, when task files written through a shell echo held control characters and fused acceptance lines. 029 also made `osq lint` and `osq approve` reject exactly that damage, so lint now guards the result whatever wrote it. The rule adds friction without adding safety: 273's planner narrowed the scopes of two task files with a script, broke the rule, and lint passed on the text it meant.

### Context

As of 2026-10-22:

- The rule lives in the managed planner block, `MANAGED_PLANNER_BLOCK` in `src/core/foundation/init-blocks.ts`, copied into `PLANNER.md` and `templates/PLANNER.md`.
- cli-foundation's scenario "Managed block includes file tool instruction" pins the exact sentence. So do `tests/init-planner.test.ts`, `tests/plan.test.ts` and `tests/architecture-first-docs.test.ts`; the last uses it as the bullet before the architecture-ADR bullet.

### Requirements

- The rule reads: "Write file contents with the file tool, never through a shell echo or heredoc. A script may make mechanical edits, such as one scope change across several task files; `osq lint` checks the result."
- The block, both PLANNER.md copies, the scenario and the tests that pin the sentence all carry the new text.

### Non-goals

- Changing what `osq lint` checks.
- An osq command that edits scopes. A scope inspector that shows facts is an idea on Notion (Tools for AI and tools for humans, 2026-10-22), not queued.
