---
queue_item: rust-pi-harness-run
queue_hash: sha256:19694ab7b20b4e21a05d1b1957689b32deee69618162d118bb47194a6971707a
planner: null
date: 2026-10-21
---

### Goal

242 gave the process runner and pi's argument and event parsing. This item makes the pi adapter run a real task, so the runners kernel can start pi for a role.

### Context

As of 2026-10-21:

- `crates/kernel/harnesses` (capability `rust-harnesses`) holds the process runner (SIGTERM through the system `kill`) and `pi_args` and the stdout-to-events parser.
- TypeScript: `src/harness/pi/pi.ts` (`preflightPi`, `probePiVersion`, the missing-key hint, the kill after `agent_settled`), and `src/core/foundation/config-pi.ts` (`resolvePiBinary`, `assessPiVersion`, `runPiAuthCheck`).
- Rust has no config reader yet, so the binary path, timeouts and tested version range come from the caller.

### Requirements

- The pi adapter finds the binary as `resolvePiBinary` does from a given setting, probes `pi --version`, warns outside the tested range as `assessPiVersion` does, and runs the credentials check with TypeScript's hint when the key is missing.
- Running a task spawns pi through the process runner, turns its stdout into core events, and stops pi after `agent_settled` as TypeScript does.
- Tests use a fake `pi` script, with no real model or network. One integration test against real pi is marked ignored.

### Non-goals

- Other harnesses, model choice and retries (runners), and reading `osq.config.ts`.
