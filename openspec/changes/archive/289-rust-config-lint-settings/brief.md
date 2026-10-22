---
queue_item: rust-config-lint-settings
queue_hash: sha256:7a1cfbcfb23ab3bffc7f174a751957dfc4462da6b38cc4a1733cffe7921cbb73
planner: null
date: 2026-10-22
---

### Goal

Every lint limit comes from config, but the Rust config has no `limits` block and no `bannedWords`. Rust lint rules that need them can't be ported until the config kernel reads them.

### Context

As of 2026-10-22:

- TypeScript defines `OsqLimits` in `src/core/foundation/config-limits.ts`, merged over `DEFAULT_CONFIG.limits` in `src/core/foundation/config.ts`. `bannedWords` is checked by `validateBannedWordsConfig`.
- ADR 029 and 252 give `crates/kernel/config`: `osq.toml` walked by hand, camelCase keys, unknown keys refused, one module per block under `blocks/`.

### Requirements

- The config kernel reads a `[limits]` table with TypeScript's keys and defaults, and a `bannedWords` list with TypeScript's validation and error text.
- A missing table gives the defaults. An unknown key, a wrong type or a bad banned word is refused.
- Table tests cover each key.

### Non-goals

- Using the values in any feature.
