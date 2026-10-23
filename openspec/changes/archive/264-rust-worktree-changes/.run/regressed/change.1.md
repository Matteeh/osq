---
reason: sync_verify_red
---
264-rust-worktree-changes: verify failed on osq/264-rust-worktree-changes merged with main:
test an_emptied_capability_is_left_out_and_another_stays ... ok
test removed_ownership_stops_counting_living_globs ... ok

failures:

---- another_removed_requirement_keeps_ownership stdout ----

thread 'another_removed_requirement_keeps_ownership' (1845325) panicked at crates/kernel/linter/tests/link_gates_removed_ownership.rs:82:5:
assertion `left == right` failed: finding count differs: got 0, expected 1
  left: 0
 right: 1
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace


failures:
    another_removed_requirement_keeps_ownership

test result: FAILED. 4 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s

error: test failed, to rerun pass `-p osq-kernel-linter --test link_gates_removed_ownership`
