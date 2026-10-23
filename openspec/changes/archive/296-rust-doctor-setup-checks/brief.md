---
queue_item: rust-doctor-setup-checks
queue_hash: sha256:a425b713715e34a60a82bf0eb2f4e2984b6dc71c2a79cc1d34ccb0ae04323ee5
planner: null
date: 2026-10-22
---

### Goal

Rust doctor checks pi (276) and stuck changes (288), but not the setup checks a human runs doctor for first: whether the config loads, whether the managed blocks are current, whether the decisions are in order, and whether git is ready.

### Context

As of 2026-10-22:

- TypeScript runs them in `runDoctorChecks` in `src/core/foundation/doctor.ts`: `checkConfig`, `checkManaged` (`doctor-managed.ts`), `checkDecisions` (`doctor-decisions.ts`) and `checkGit` (`src/core/vcs/doctor-git.ts`), in that order around the change checks.
- 276 and 288 built `crates/features/doctor`. The config kernel loads `osq.toml` (252); the specs kernel parses ADRs (229).

### Requirements

- Rust `osq doctor` prints these four checks' lines with TypeScript's text, in TypeScript's order next to the existing lines, and exits non-zero when one fails.
- Tests cover a passing and a failing case of each check.

### Non-goals

- The validator, languages and planning-price checks.
