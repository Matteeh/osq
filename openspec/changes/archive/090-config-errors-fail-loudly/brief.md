---
queue_item: config-errors-fail-loudly
queue_hash: sha256:8cb84e6247c361c0e497a0d52fc6771a4720204f7dc2913186c4b52d71bb15e2
planner: null
date: 2026-09-26
---

### Goal

A broken `osq.config.ts` stops osq with a clear error instead of silently falling back to the defaults. This matters now that the `vcs` block has required fields: a mistyped `vcs.author` would otherwise turn version control off without a word.

### Context

- `loadConfig` in `src/core/foundation/config.ts` imports the config file with jiti inside a `try`, and on any error only logs when `DEBUG_OSQ` is set, then continues with an empty user config. Reported by change 086's executor.
- `defineConfig` validates blocks and throws on bad values, and a config file calls it at import time, so its errors land in that `catch`.

### Requirements

- When a config file exists but fails to import or validate, `loadConfig` throws an error naming the file and the original message.
- Every command that loads config prints that error and exits 1.
- `osq doctor`'s `config` check fails with the message, as it already does for errors it sees.
- A project with no config file still loads the defaults.

### Non-goals

- New validation rules.

### Notes for planning

- `config.ts` has 244 of 250 lines.
- Measure which existing tests rely on the silent fallback before scoping.
