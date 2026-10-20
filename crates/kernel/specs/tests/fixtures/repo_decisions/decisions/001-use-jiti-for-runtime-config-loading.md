---
status: accepted
applies_to: [cli-foundation]
rule: Load osq.config.ts, .js and .mjs with jiti; add no other TypeScript loader.
---
# 001. Use jiti for Runtime Config Loading

Date: 2026-09-17

## Status

Accepted

## Context

`osq` scaffolds an `osq.config.ts` file in consumer repositories. This configuration file allows projects to override timeouts, paths, harness settings, and lint rules. Because consumer repositories are TypeScript projects, `osq` must load `osq.config.ts` at runtime across various Node.js environments (Node >= 22.0.0).

While Node.js 22+`has experimental support for stripping types, it requires specific CLI flags (`--experimental-strip-types`) in earlier 22.x minor versions, does not execute TypeScript syntax containing non-type constructs or enums in all contexts, and cannot resolve ESM/TS config imports without custom loaders when invoked from a globally installed or npm-symlinked CLI binary. Requiring consumer projects to install `tsx` as a dependency is also undesirable.

The repository principle in `AGENTS.md` states:
"Zero runtime dependencies beyond `chokidar`, `yaml`, and `commander`; propose an ADR before adding one."

## Decision

Add `jiti` (`^2.x ( as a runtime dependency for loading `osq.config.ts`, `osq.config.js`, and `osq.config.mjs`.

## Consequences

- **Pros**:
  - `jiti` is a lightweight, zero-dependency TypeScript/ESM runtime loader widely adopted across the ecosystem (e.g., Nuxt, Tailwind, Vite).
  - Works seamlessly across all supported Node versions (>= 22.0.0) without requiring experimental node CLI flags.
  - Consumers do not need `tsx` installed in their projects.
  - Transparently falls back to `DEFAULT_CONFIG` if no config file is found.
- **Cons**:
  - Adds one production dependency (`jiti`).
