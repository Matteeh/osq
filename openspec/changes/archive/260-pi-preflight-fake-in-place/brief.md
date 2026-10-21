---
queue_item: pi-preflight-fake-in-place
queue_hash: sha256:5e1e6379915632a08827a8b0437bf6acf84416fd470db0ed77d253a2953e5a66
planner: null
date: 2026-10-21
---

### Goal

`crates/kernel/harnesses/tests/pi_preflight.rs` copies `tests/fixtures/fake-pi/preflight.sh` into a temp folder, sets mode 755, and runs it. That is the pattern that failed 251's cargo-mutants baseline with ETXTBSY ("Text file busy") when tests run in parallel: another thread's fork can still hold the file open for writing when this thread execs it. Run the fixture in place, as `pi_harness_run.rs` does since 251.

### Context

As of 2026-10-21:

- 251 regressed when the mutants baseline failed `pi_start_arguments_and_defaults` with ETXTBSY. Copying then executing failed 5 of 40 runs. Running the committed executable in place failed 0 of 60.
- `fake_pi` in `pi_preflight.rs` still copies and chmods. It passed 60 of 60 runs, but it has the same race.
- `tests/fixtures/fake-pi/preflight.sh` is committed as mode 100644. `run.sh` is 100755.

### Requirements

- `preflight.sh` is committed executable (mode 100755), and the preflight tests run it from the fixture folder without copying it.
- Where a test needs the binary named `pi` on a PATH, it uses a symlink or a PATH entry that points at the committed file, never a written copy.
- No other test under `crates/` copies a file and then executes it.

### Non-goals

- Changing the preflight code itself.
