---
reason: verify_red
command: "sh scripts/verify-rust.sh"
exit_code: 101
---
Archive-time change-level verification failed.

test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

     Running unittests src/lib.rs (target/debug/deps/osq_kernel_loop-20a0d4da06391d8a)

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

     Running tests/active_schedule.rs (target/debug/deps/active_schedule-9e5cea1c0279ef43)

running 5 tests
test project_without_changes ... ok
test unreadable_task_file ... ok
test unreadable_proposal ... ok
test archived_folder_name_and_unapproved_markers ... ok
test states_of_the_fixture_repository ... ok

test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s

     Running tests/schedule_corpus.rs (target/debug/deps/schedule_corpus-1bc5f083c4b4499d)

running 1 test
test active_schedule_of_this_repository ... FAILED

failures:

---- active_schedule_of_this_repository stdout ----

thread 'active_schedule_of_this_repository' (3981785) panicked at crates/kernel/loop/tests/schedule_corpus.rs:21:42:
the active changes read: Storage(EventLine { path: "openspec/changes/251-rust-pi-harness-run/.run/events/2.jsonl", line: 89, source: InvalidData { kind: "recertification" } })
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace


failures:
    active_schedule_of_this_repository

test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s

error: test failed, to rerun pass `-p osq-kernel-loop --test schedule_corpus`
Full output: .run/logs/change-5.log
