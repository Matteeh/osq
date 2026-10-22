//! Proves the refusals Rust retry adds to TypeScript's own.

mod support;

use std::fs;

use support::{change_folder, failed_message, run, scratch_copy, tree, write};

/// Proves the refusal rows of "Retry refusals osq adds" and that nothing changed.
///
/// Covers: rust-retry/retry-refusals-osq-adds
#[test]
fn retry_refusals_osq_adds() {
    let rows: [([&str; 2], &str); 2] = [
        (
            ["12", "1"],
            "Marker reason \"weird\" is not one osq knows; retry is refused.",
        ),
        (
            ["11", "1"],
            "Task 1 of 011-scope-hash needs recertification, which Rust retry does not run yet; run the TypeScript osq retry.",
        ),
    ];
    for (index, (args, expected)) in rows.into_iter().enumerate() {
        let name = format!("retry_refusal_{index}");
        let root = scratch_copy("retry_refusals", &name);
        let before = tree(&root);
        let error = run(&root, args).expect_err("the retry is refused");
        assert_eq!(failed_message(error), expected, "{args:?}");
        assert_eq!(tree(&root), before, "{args:?}: every file is unchanged");
    }
}

/// Proves the approval and running checks before any write.
///
/// Covers: rust-retry/retry-refusals-osq-adds
#[test]
fn retry_refuses_before_writing() {
    let rows: [(&str, &str, [&str; 2], &str); 3] = [
        (
            "blank_approval",
            "001-dead",
            ["1", "1"],
            "Change 001 is not approved. Run `osq approve 001` before retrying.",
        ),
        (
            "zero_pid",
            "009-running",
            ["9", "1"],
            "Task 1 was left running by a stopped watcher (pid 0); run osq watch to reap it, then osq retry 009 1 if it stays dead.",
        ),
        (
            "negative_pid",
            "009-running",
            ["9", "1"],
            "Task 1 was left running by a stopped watcher (pid -1); run osq watch to reap it, then osq retry 009 1 if it stays dead.",
        ),
    ];
    for (name, folder, args, expected) in rows {
        let root = scratch_copy("retry_refusals", name);
        let change = change_folder(&root, folder);
        if name == "blank_approval" {
            write(&change, ".run/approved", "  \n");
        } else {
            let pid = if name == "zero_pid" { "0" } else { "-1" };
            write(
                &change,
                ".run/running/1.pid",
                format!("{{\"pid\":{pid}}}\n"),
            );
        }
        let before = tree(&root);
        let error = run(&root, args).expect_err("the retry is refused");
        assert_eq!(failed_message(error), expected, "{name}");
        assert_eq!(tree(&root), before, "{name}: every file is unchanged");
    }
}

/// Proves an empty recorded scope hash is not a recertification.
///
/// Covers: rust-retry/retry-refusals-osq-adds
#[test]
fn retry_allows_an_empty_scope_hash() {
    let root = scratch_copy("retry_refusals", "empty_scope_hash");
    let change = change_folder(&root, "011-scope-hash");
    write(
        &change,
        ".run/done/1",
        "---\nscope_hash: \"\"\n---\n2026-10-01T10:00:00.000Z\n",
    );
    let output = run(&root, ["11", "1"]).expect("an empty hash needs no recertification");
    assert_eq!(
        output.text,
        "Retried 011 task 1 (next attempt: 2)\n  Reason: scope_regression\n  Retained: .run/regressed/1.1.md\n  Retained: .run/done/1.1\n"
    );
}

/// Proves the target check trims and accepts only `change` or ASCII digits.
///
/// Covers: rust-retry/retry-refusals-osq-adds
#[test]
fn retry_refuses_other_targets() {
    let rows: [(&str, &str); 5] = [
        (
            "",
            "Invalid retry target \"\": expected a numeric task or \"change\".",
        ),
        (
            "  ",
            "Invalid retry target \"  \": expected a numeric task or \"change\".",
        ),
        (
            "-1",
            "Invalid retry target \"-1\": expected a numeric task or \"change\".",
        ),
        (
            "1.0",
            "Invalid retry target \"1.0\": expected a numeric task or \"change\".",
        ),
        (
            "CHANGE",
            "Invalid retry target \"CHANGE\": expected a numeric task or \"change\".",
        ),
    ];
    for (index, (target, expected)) in rows.into_iter().enumerate() {
        let name = format!("retry_target_{index}");
        let root = scratch_copy("retry_refusals", &name);
        let before = tree(&root);
        let error = run(&root, ["1", target]).expect_err("the target is refused");
        assert_eq!(failed_message(error), expected, "{target:?}");
        assert_eq!(tree(&root), before, "{target:?}: every file is unchanged");
    }
}

/// Proves a marker reason that is not a string falls back to its marker kind.
///
/// Covers: rust-retry/retry-refusals-osq-adds
#[test]
fn retry_treats_a_non_string_reason_as_its_kind() {
    let root = scratch_copy("retry_refusals", "non_string_reason");
    let change = change_folder(&root, "001-dead");
    write(&change, ".run/dead/1.md", "---\nreason: 7\n---\nNumeric.\n");
    let output = run(&root, ["1", "1"]).expect("the fallback reason is a failure reason");
    assert_eq!(
        output.text,
        "Retried 001 task 1 (next attempt: 2)\n  Reason: dead\n  Retained: .run/dead/1.1.md\n"
    );
    assert!(
        fs::read_to_string(change.join(".run/dead/1.1.md"))
            .expect("the retained marker reads")
            .contains("reason: 7")
    );
}

/// Proves a missing event folder is created and one event line is appended.
///
/// Covers: rust-retry/retry-refusals-osq-adds
#[test]
fn retry_creates_the_event_folder() {
    let root = scratch_copy("retry_refusals", "event_folder");
    let change = change_folder(&root, "001-dead");
    fs::remove_dir_all(change.join(".run/events")).expect("the fixture has an events folder");
    let output = run(&root, ["1", "1"]).expect("the retry records");
    assert!(
        output
            .text
            .starts_with("Retried 001 task 1 (next attempt: 2)\n")
    );
    let line =
        fs::read_to_string(change.join(".run/events/1.jsonl")).expect("the event file is created");
    assert_eq!(line.lines().count(), 1, "one retry line");
}

/// Proves recertification needs a task-only scope regression with a hash.
///
/// Covers: rust-retry/retry-refusals-osq-adds
#[test]
fn retry_recertifies_only_a_task_scope_regression() {
    let rows: [(&str, &str, [&str; 2], &str); 3] = [
        (
            "change_scope_regression",
            "003-change-regressed",
            ["3", "change"],
            "Retried 003 change (next attempt: 2)\n  Reason: scope_regression\n  Retained: .run/regressed/change.1.md\n",
        ),
        (
            "dead_and_scope_regression",
            "005-dead-and-regressed",
            ["5", "1"],
            "Retried 005 task 1 (next attempt: 2)\n  Reason: scope_regression\n  Retained: .run/regressed/1.1.md\n  Retained: .run/dead/1.1.md\n  Retained: .run/done/1.1\n",
        ),
        (
            "other_regression_reason",
            "010-scope-plain",
            ["10", "1"],
            "Retried 010 task 1 (next attempt: 2)\n  Reason: verify_red\n  Retained: .run/regressed/1.1.md\n  Retained: .run/done/1.1\n",
        ),
    ];
    for (name, folder, args, expected) in rows {
        let root = scratch_copy("retry_refusals", name);
        let change = change_folder(&root, folder);
        let regressed = change
            .join(".run/regressed")
            .join(format!("{}.md", args[1]));
        let reason = if name == "other_regression_reason" {
            "verify_red"
        } else {
            "scope_regression"
        };
        write(
            &change,
            &format!(".run/regressed/{}.md", args[1]),
            format!("---\nreason: {reason}\n---\n- src/a.txt\n"),
        );
        assert!(regressed.exists(), "the regressed marker exists");
        write(
            &change,
            &format!(".run/done/{}", args[1]),
            "---\nscope_hash: sha256:1111111111111111111111111111111111111111111111111111111111111111\n---\n2026-10-01T10:00:00.000Z\n",
        );
        let output = run(&root, args).expect("the retry is not a recertification");
        assert_eq!(output.text, expected, "{name}");
        if args[1] == "change" {
            assert!(
                change.join(".run/done").join(args[1]).exists(),
                "{name}: the change target keeps its done marker"
            );
        }
    }
}
