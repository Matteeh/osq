---
queue_item: rust-doctor-changes
queue_hash: sha256:194482fe0f4da94c89d38a0e644ca7e3e5ed0ede9b412301f3731d9b814b3d28
planner: null
date: 2026-10-22
---

### Goal

After a crash or a hand edit, `osq doctor` finds stale locks, broken archives and done markers that don't match their tasks. Rust doctor checks only pi, so it can't tell a human why a run is stuck.

### Context

As of 2026-10-22:

- TypeScript has `checkLocks`, `checkArchives` and `checkDoneMarkers` in `src/core/foundation/doctor-changes.ts`, called from `runDoctorChecks` in `src/core/foundation/doctor.ts`.
- 276 built `crates/features/doctor` with the pi checks and TypeScript's line format and exit code.

### Requirements

- Rust `osq doctor` prints the lock, archive and done-marker lines TypeScript prints, for a healthy project and for each failure each check reports, and exits non-zero when any check fails.
- Tests build each case on a fixture project.

### Non-goals

- Config, harness, validator, managed-block, language and decision checks.
