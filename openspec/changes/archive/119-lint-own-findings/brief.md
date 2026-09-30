---
queue_item: lint-own-findings
queue_hash: sha256:3e5326fb169e22d3d18214d6307c25c16f95d88cc2913e4589456535489e7bf7
planner: null
date: 2026-09-29
---

### Goal

`osq lint <id>` prints the findings for the change it was asked about. Repository findings, which are about other changes and the living specs, print as one count line with the command that lists them.

### Context

- `osq lint 114` on 2026-09-29 printed 250 `repository:` warnings, nearly all "Requirement text is very long (>500 characters)" from the openspec validator on living specs. The change's own findings were 3 lines at the end.
- `REPOSITORY_HEADER` in `src/core/spec/lint-output.ts` already says repository findings don't affect the exit code. They are grouped and deduplicated there, then printed one per line.
- Planners run `osq lint` several times per change, and every run puts all 250 lines into the planner's context.

### Requirements

- Text output for `osq lint <id>` prints the change's own findings as today, then one line: `repository: <n> findings about other changes and living specs; osq lint --repository lists them`. With no repository findings it prints nothing for them.
- `osq lint --repository` prints every repository finding, one per line, as today.
- `--json` still carries every repository finding.
- The exit code is unchanged.

### Non-goals

- Changing which findings exist, or their severity.
- Shortening the living specs to clear the validator warning.

### Notes for planning

- Tests that pin the repository group's text output need `tests.modify`. Measure in a scratch worktree.
