---
reason: verify_red
command: "sh scripts/verify-rust.sh"
exit_code: 4
---
Archive-time change-level verification failed.

test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

     Running `/tmp/cargo-mutants-266-rust-pi-config-bYl04y.tmp/target/debug/deps/link_gates_ownership-cd977749eb0daed9`

running 3 tests
test findings_of_the_link_gates_ownership_fixture ... ok
test a_change_moves_ownership_to_a_new_capability ... ok
test a_new_capability_s_ownership_overlaps_a_living_one ... ok

test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

     Running `/tmp/cargo-mutants-266-rust-pi-config-bYl04y.tmp/target/debug/deps/link_gates_removed_ownership-02eb13f35a99f1a7`

running 5 tests
test a_change_removes_a_capability_s_ownership ... ok
test removed_ownership_with_no_new_owner ... ok
test another_removed_requirement_keeps_ownership ... FAILED
test an_emptied_capability_is_left_out_and_another_stays ... ok
test removed_ownership_stops_counting_living_globs ... ok

failures:

---- another_removed_requirement_keeps_ownership stdout ----

thread 'another_removed_requirement_keeps_ownership' (1902581) panicked at crates/kernel/linter/tests/link_gates_removed_ownership.rs:192:46:
the keep spec reads: Os { code: 2, kind: NotFound, message: "No such file or directory" }
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace


failures:
    another_removed_requirement_keeps_ownership

test result: FAILED. 4 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s

error: test failed, to rerun pass `-p osq-kernel-linter --test link_gates_removed_ownership`

*** result: Failure(101)

ERROR cargo test failed in an unmutated tree, so no mutants were tested
Full output: .run/logs/change-5.log
