---
reason: verify_red
command: "sh scripts/verify-rust.sh"
exit_code: 4
---
Archive-time change-level verification failed.

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

     Running `/tmp/cargo-mutants-251-rust-pi-harness-run-YBXoOl.tmp/target/debug/deps/pi_args-a5be759bf2f3d57e`

running 1 test
test arguments_for_pi_settings ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

     Running `/tmp/cargo-mutants-251-rust-pi-harness-run-YBXoOl.tmp/target/debug/deps/pi_harness_run-838301d3fcd630db`

running 5 tests
test pi_agent_names ... ok
test pi_harness_that_cannot_start ... ok
test settled_start_hides_stderr ... ok
test pi_start_arguments_and_defaults ... FAILED
test pi_tasks_with_a_fake_pi ... ok

failures:

---- pi_start_arguments_and_defaults stdout ----

thread 'pi_start_arguments_and_defaults' (27187) panicked at crates/kernel/harnesses/tests/pi_harness_run.rs:303:10:
the fake wrote its arguments: Os { code: 2, kind: NotFound, message: "No such file or directory" }
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace


failures:
    pi_start_arguments_and_defaults

test result: FAILED. 4 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.31s

error: test failed, to rerun pass `-p osq-kernel-harnesses --test pi_harness_run`

*** result: Failure(101)

ERROR cargo test failed in an unmutated tree, so no mutants were tested
Full output: .run/logs/change-7.log
