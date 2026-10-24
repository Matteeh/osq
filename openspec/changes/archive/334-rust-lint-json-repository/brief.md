---
queue_item: rust-lint-json-repository
queue_hash: sha256:54293f16e0dd2af6fa802e1bccfe56a79e10f6842955d426a26428f5eb014194
planner: null
date: 2026-10-24
---

### Goal

Rust `osq lint` lints one change and prints text. TypeScript lints several ids at once, prints findings as JSON for tools, and lists every repository finding with `--repository`. Port those.

### Context

As of 2026-10-24:

- TypeScript: `src/cli/lint.ts`: several ids, `--json`, `--repository` (`printRepositoryFindings`, `dedupeFindings`), and the count line `repository: <n> findings about other changes and living specs; osq lint --repository lists them`.
- Rust: `crates/features/lint` (275, 299) lints one change and prints that count line.

### Requirements

- Rust `osq lint [ids...]`, with `--json` and `--repository`, prints TypeScript's output and exit codes for one id, several ids and none.
- Tests compare with TypeScript's `dist` on fixture projects with valid, warning and failing changes.

### Non-goals

- New lint rules.
