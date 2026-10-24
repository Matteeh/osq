---
queue_item: rust-doctor-checks
queue_hash: sha256:872da43c315b1c571aa9571b19a073781465e5806785dc01a06e5c8b204481d2
planner: null
date: 2026-10-24
---

### Goal

On this repository TypeScript's `osq doctor` prints 16 checks and Rust prints 7. Port the missing checks so Rust doctor tells a human the same things.

### Context

As of 2026-10-24:

- TypeScript checks Rust lacks: `harness-containment` and the harness lines for harnesses other than pi (`src/core/foundation/doctor.ts`), `validator` (the pinned OpenSpec version), `languages` (`doctor-languages.ts`), `planning-prices` (`doctor-prices.ts`), and `validator-harness`, `validator-harness-version`, `validator-model` and `validator-runs` (`doctor-validator.ts`).
- Rust: `crates/features/doctor` has the pi, change, managed-block, decision and git checks.

### Requirements

- Rust `osq doctor` prints each of those checks with TypeScript's name, status, text and order, and fails as TypeScript does.
- A check that needs config Rust does not read yet reads it through the config kernel, with TypeScript's default.
- Tests compare with TypeScript's `dist` on fixture projects, with fake harness programs where a check runs one.

### Non-goals

- Running the validator.
