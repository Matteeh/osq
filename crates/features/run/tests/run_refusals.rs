//! Proves the run feature's calls, its refusals and its approval conflicts.

mod support;

#[path = "../src/feature/time.rs"]
mod source_time;

use std::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::Path;

use osq_core::event::DeadReason;
use osq_core::{Command, Event, Feature, parse_event_line};
use osq_feature_run::RunFeature;

use support::{FOLDER, TASK};

/// One row of "Run refusal texts": its name, arguments, change and ending.
type Refusal = (&'static str, [&'static str; 2], fn(&Path), &'static str);

/// Proves the feature's name, command and argument errors.
///
/// Covers: rust-run/run-feature-calls
#[test]
fn run_feature_calls() {
    let feature = RunFeature;
    assert_eq!(feature.name(), "run", "the feature name");
    let commands = feature.commands();
    assert_eq!(commands.len(), 1, "one command");
    assert_eq!(
        commands[0],
        Command::new(
            "run",
            "run one task of an approved change once",
            "<id> <task>"
        ),
        "the run command"
    );

    let root = support::scratch("feature-calls");
    let cases: Vec<(&str, &str, Vec<&str>, &str)> = vec![
        (
            "one arg",
            "run",
            vec!["1"],
            "usage of run: expected <id> <task>",
        ),
        (
            "three args",
            "run",
            vec!["1", "1", "x"],
            "usage of run: expected <id> <task>",
        ),
        (
            "unknown command",
            "approve",
            vec!["1"],
            "unknown command: approve",
        ),
    ];
    for (name, command, args, expected) in cases {
        let error = support::run_args(&root, command, &args).expect_err("the invocation fails");
        assert_eq!(error.to_string(), expected, "{name}");
    }
}

/// Proves every row of "Run refusal texts".
///
/// Covers: rust-run/run-refusal-texts
#[test]
fn run_refusal_texts() {
    let rows: [Refusal; 9] = [
        (
            "config error",
            ["1", "1"],
            bad_config,
            "vcs.enabled must be a boolean",
        ),
        (
            "unknown change",
            ["9", "1"],
            unchanged,
            "Spec \"9\" not found in <root>/openspec/changes",
        ),
        (
            "unknown task",
            ["1", "7"],
            unchanged,
            "Task 7 not found in 001-a",
        ),
        (
            "claude executor",
            ["1", "1"],
            claude,
            "Rust run supports only the pi harness, not claude",
        ),
        (
            "outside git",
            ["1", "1"],
            no_git,
            "Rust run needs a git repository at <root>",
        ),
        (
            "done task",
            ["1", "1"],
            done,
            "Task 1 of 001-a is done; nothing to run",
        ),
        (
            "dead task",
            ["1", "1"],
            dead,
            "Task 1 of 001-a is dead; nothing to run",
        ),
        (
            "regressed task",
            ["1", "1"],
            regressed,
            "Task 1 of 001-a is regressed; nothing to run",
        ),
        (
            "running task",
            ["1", "1"],
            running,
            "Task 1 of 001-a is already running",
        ),
    ];
    for (index, (name, args, change, expected)) in rows.into_iter().enumerate() {
        let root = support::repo(&format!("refusal-{index}"));
        change(&root);
        let folder = format!("openspec/changes/{FOLDER}");
        let before_tree = support::tree(&root, &folder);
        let before_status = support::status(&root);
        let error = support::run_args(&root, "run", &args).expect_err("the row is refused");
        let wanted = expected.replace("<root>", &root.display().to_string());
        assert_eq!(error.to_string(), format!("run failed: {wanted}"), "{name}");
        assert_eq!(support::tree(&root, &folder), before_tree, "{name}: folder");
        assert_eq!(support::status(&root), before_status, "{name}: git status");
    }
}

/// Proves every row of "Approval conflicts".
///
/// Covers: rust-run/approval-conflicts
#[test]
fn approval_conflicts() {
    let rows: [(&str, Option<&str>); 2] = [("missing", None), ("changed", Some("sha256:old\n"))];
    for (name, approved) in rows {
        let root = support::repo(&format!("approval-{name}"));
        let seal = support::current_seal(&root);
        let marker = format!("openspec/changes/{FOLDER}/.run/approved");
        match approved {
            Some(text) => support::write(&root, &marker, text),
            None => support::remove(&root, &marker),
        }
        let before = support::now_utc();
        let error = support::run(&root, &["1", "1"]).expect_err("the approval conflicts");
        let after = support::now_utc();
        assert_eq!(
            error.to_string(),
            "run failed: task 1 of 001-a died: spec_conflict".to_owned(),
            "{name}"
        );
        let expected = match approved {
            None => "---\nreason: spec_conflict\n---\nSpec has not been approved (missing .run/approved).\n".to_owned(),
            Some(text) => format!(
                "---\nreason: spec_conflict\napproved_hash: \"{}\"\ncurrent_hash: \"{seal}\"\n---\nChange folder modified after approval. Expected {}, computed {seal}.\n",
                text.trim(),
                text.trim()
            ),
        };
        assert_eq!(
            support::read_text(
                &root,
                &format!("openspec/changes/{FOLDER}/.run/dead/{TASK}.md")
            ),
            expected,
            "{name}: dead marker"
        );
        assert!(
            !support::exists(
                &root,
                &format!("openspec/changes/{FOLDER}/.run/running/{TASK}.pid")
            ),
            "{name}: the lock is removed"
        );
        assert!(
            !support::exists(
                &root,
                &format!("openspec/changes/{FOLDER}/.run/results/{TASK}.md")
            ),
            "{name}: no executor ran"
        );

        let line = support::last_event(&root, TASK);
        let envelope = parse_event_line(&line).expect("the last event parses");
        assert_eq!(envelope.timestamp.len(), 24, "{name}: the time shape");
        assert!(
            before <= envelope.timestamp && envelope.timestamp <= after,
            "{name}: the time is UTC now, between {before} and {after}"
        );
        match envelope.event {
            Event::Dead(data) => {
                assert_eq!(data.task, TASK, "{name}: the dead task");
                assert_eq!(data.reason, DeadReason::SpecConflict, "{name}: the reason");
            }
            other => panic!("{name}: expected a dead event, got {other:?}"),
        }
    }
}

/// Proves the fixed UTC form across era, leap-year and month edges.
///
/// Covers: rust-run/dead-event
#[test]
fn utc_text_for_fixed_times() {
    let rows: [(i64, &str); 16] = [
        (-62_162_121_600_000, "0000-02-29T00:00:00.000Z"),
        (-62_162_035_200_001, "0000-02-29T23:59:59.999Z"),
        (-62_162_035_200_000, "0000-03-01T00:00:00.000Z"),
        (-62_135_596_800_000, "0001-01-01T00:00:00.000Z"),
        (-59_006_316_303_211, "0100-03-01T12:34:56.789Z"),
        (-49_539_254_400_001, "0400-02-29T23:59:59.999Z"),
        (-11_670_998_400_000, "1600-02-29T00:00:00.000Z"),
        (-1, "1969-12-31T23:59:59.999Z"),
        (0, "1970-01-01T00:00:00.000Z"),
        (951_804_428_009, "2000-02-29T06:07:08.009Z"),
        (1_709_208_000_000, "2024-02-29T12:00:00.000Z"),
        (1_735_689_599_999, "2024-12-31T23:59:59.999Z"),
        (1_735_689_600_000, "2025-01-01T00:00:00.000Z"),
        (1_792_231_200_000, "2026-10-17T10:00:00.000Z"),
        (13_574_563_200_000, "2400-02-29T00:00:00.000Z"),
        (253_402_300_799_999, "9999-12-31T23:59:59.999Z"),
    ];
    for (ms, expected) in rows {
        assert_eq!(source_time::format_utc(ms), expected, "{ms}");
    }
    assert!(source_time::now_ms() > 0, "the clock is after the epoch");
}

/// Proves an approved task takes and removes its lock before task three.
///
/// Covers: rust-run/lock-removed-after-a-run
#[test]
fn run_passing_approval_takes_and_removes_the_lock() {
    let root = support::repo("passing-approval");
    let error = support::run(&root, &["1", "1"]).expect_err("task three is not here yet");
    assert_eq!(
        error.to_string(),
        "run failed: task 1 of 001-a cannot start yet"
    );
    assert!(
        !support::exists(
            &root,
            &format!("openspec/changes/{FOLDER}/.run/running/{TASK}.pid")
        ),
        "the lock is removed"
    );
}

/// Proves a lock path that cannot be written fails instead of looking taken.
///
/// Covers: rust-run/lock-removed-after-a-run
#[cfg(unix)]
#[test]
fn lock_path_that_cannot_be_written_fails() {
    let root = support::repo("lock-permission");
    let running = root
        .join("openspec")
        .join("changes")
        .join(FOLDER)
        .join(".run")
        .join("running");
    fs::create_dir_all(&running).expect("the running folder is created");
    let writable = fs::metadata(&running).expect("the running folder reads");
    let mut read_only = writable.permissions();
    read_only.set_mode(0o500);
    fs::set_permissions(&running, read_only).expect("the running folder is read only");
    let result = support::run(&root, &["1", "1"]);
    fs::set_permissions(&running, writable.permissions()).expect("the running folder is writable");
    let error = result.expect_err("the lock cannot be written");
    let text = error.to_string();
    assert!(text.starts_with("run failed: cannot write "), "{text}");
    assert!(text.contains(&format!("running/{TASK}.pid")), "{text}");
}

/// Leaves an `osq.toml` whose `vcs.enabled` is not a boolean.
fn bad_config(root: &Path) {
    support::write(root, "osq.toml", "[vcs]\nenabled = \"yes\"\n");
}

/// Leaves a copy the row does not change.
fn unchanged(_root: &Path) {}

/// Names the claude executor harness.
fn claude(root: &Path) {
    support::write(root, "osq.toml", "[executor]\nharness = \"claude\"\n");
}

/// Removes the repository's `.git` folder.
fn no_git(root: &Path) {
    fs::remove_dir_all(root.join(".git")).expect("the git folder is removed");
}

/// Leaves a done marker for the task.
fn done(root: &Path) {
    support::write(
        root,
        &format!("openspec/changes/{FOLDER}/.run/done/{TASK}"),
        "x",
    );
}

/// Leaves a dead marker for the task.
fn dead(root: &Path) {
    support::write(
        root,
        &format!("openspec/changes/{FOLDER}/.run/dead/{TASK}.md"),
        "x",
    );
}

/// Leaves a regressed marker for the task.
fn regressed(root: &Path) {
    support::write(
        root,
        &format!("openspec/changes/{FOLDER}/.run/regressed/{TASK}.md"),
        "x",
    );
}

/// Leaves a lock another run holds for the task.
fn running(root: &Path) {
    support::write(
        root,
        &format!("openspec/changes/{FOLDER}/.run/running/{TASK}.pid"),
        "x",
    );
}
