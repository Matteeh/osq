//! Proves the run feature's executor start, audit, verdict and done record.

mod support;

#[allow(dead_code)]
#[path = "../src/feature/text.rs"]
mod source_text;

use std::path::{Path, PathBuf};

use osq_core::event::{Event, parse_event_line};

use support::{FOLDER, TASK};

/// One mode of the committed fake pi and the reason the task ends with, or
/// none when the task is done.
struct Row {
    /// The fake pi's mode.
    mode: &'static str,
    /// The dead reason, or none when the task is done.
    reason: Option<&'static str>,
}

/// Every "Run outcomes" row, in the table's order.
const ROWS: &[Row] = &[
    Row {
        mode: "done",
        reason: None,
    },
    Row {
        mode: "no-file",
        reason: Some("verify_red"),
    },
    Row {
        mode: "breaks-change",
        reason: Some("change_verify_red"),
    },
    Row {
        mode: "no-result",
        reason: Some("no_result"),
    },
    Row {
        mode: "blocked",
        reason: Some("blocked"),
    },
    Row {
        mode: "outside",
        reason: Some("scope_violation"),
    },
    Row {
        mode: "frozen",
        reason: Some("undeclared_test_change"),
    },
    Row {
        mode: "crash",
        reason: Some("crashed"),
    },
    Row {
        mode: "crash-after-result",
        reason: None,
    },
];

/// The fake pi's executable path, made absolute for `pi.bin`.
fn fake_pi() -> String {
    support::fixture("fake-pi")
        .join("run.sh")
        .to_string_lossy()
        .into_owned()
}

/// A fresh committed run fixture whose config names the fake pi and whose
/// working folder carries `mode`.
fn repo(name: &str, mode: &str) -> PathBuf {
    let root = support::repo(name);
    let config = format!(
        "[executor]\nharness = \"pi\"\n\n[pi]\nbin = \"{}\"\n",
        fake_pi()
    );
    support::write(&root, "osq.toml", config);
    support::write(&root, "fake-pi-mode", mode);
    root
}

/// Runs task 1 of the fixture in `mode`.
fn run_mode(name: &str, mode: &str) -> (PathBuf, Result<String, String>) {
    let root = repo(name, mode);
    let result = support::run(&root, &[FOLDER, TASK]).map(|output| output.text);
    (root, result.map_err(|error| error.to_string()))
}

/// The dead marker of task 1.
fn marker(root: &Path) -> String {
    support::read_text(
        root,
        &format!("openspec/changes/{FOLDER}/.run/dead/{TASK}.md"),
    )
}

/// The task's event envelopes.
fn events(root: &Path) -> Vec<osq_core::event::Envelope> {
    support::read_text(
        root,
        &format!("openspec/changes/{FOLDER}/.run/events/{TASK}.jsonl"),
    )
    .lines()
    .filter(|line| !line.trim().is_empty())
    .map(|line| parse_event_line(line).expect("the event parses"))
    .collect()
}

/// Proves every row of the "Run outcomes" table.
///
/// Covers: rust-run/run-outcomes
#[test]
fn run_outcomes() {
    for row in ROWS {
        let (root, result) = run_mode(&format!("outcome-{}", row.mode), row.mode);
        match row.reason {
            Some(reason) => {
                assert_eq!(
                    result.expect_err("the row dies"),
                    format!("run failed: task {TASK} of {FOLDER} died: {reason}"),
                    "{}",
                    row.mode
                );
                assert!(
                    marker(&root).starts_with(&format!("---\nreason: {reason}\n")),
                    "{}: the dead reason",
                    row.mode
                );
            }
            None => {
                assert_eq!(
                    result.expect("the row is done"),
                    format!("Task {TASK} of {FOLDER} done\n"),
                    "{}",
                    row.mode
                );
            }
        }
        if row.mode == "no-file" {
            let dead = marker(&root);
            assert!(dead.contains("command: \"test -f src/a.txt\""), "{dead}");
        }
        if row.mode == "breaks-change" {
            let dead = marker(&root);
            assert!(
                dead.contains("command: \"test ! -f src/broken.txt\""),
                "{dead}"
            );
            assert!(dead.contains("exit_code: 1"), "{dead}");
        }
        if row.mode == "no-result" {
            assert!(marker(&root).contains("reason: no_result"));
        }
        if row.mode == "blocked" {
            assert!(marker(&root).contains("need a key"));
        }
    }
}

/// Proves every dying "Run outcomes" row ends with its `dead` event.
///
/// Covers: rust-run/dead-event
#[test]
fn dead_event() {
    for row in ROWS.iter().filter(|row| row.reason.is_some()) {
        let (root, _) = run_mode(&format!("dead-{}", row.mode), row.mode);
        let envelope =
            parse_event_line(&support::last_event(&root, TASK)).expect("the last event parses");
        match envelope.event {
            Event::Dead(data) => {
                assert_eq!(data.task, TASK, "{}", row.mode);
                assert_eq!(Some(data.reason.as_str()), row.reason, "{}", row.mode);
            }
            other => panic!("{}: expected a dead event, got {other:?}", row.mode),
        }
    }
}

/// Proves every "Run outcomes" row removes the task's lock.
///
/// Covers: rust-run/lock-removed-after-a-run
#[test]
fn lock_removed_after_a_run() {
    for row in ROWS {
        let (root, _) = run_mode(&format!("lock-{}", row.mode), row.mode);
        assert!(
            !support::exists(
                &root,
                &format!("openspec/changes/{FOLDER}/.run/running/{TASK}.pid")
            ),
            "{}: the lock is removed",
            row.mode
        );
    }
}

/// Proves the start, exit and continuation events of crashing runs.
///
/// Covers: rust-run/executor-exits
#[test]
fn executor_exits() {
    for mode in ["crash", "crash-after-result"] {
        let (root, result) = run_mode(&format!("exit-{mode}"), mode);
        let events = events(&root);
        let started = events
            .iter()
            .position(|event| {
                matches!(&event.event, Event::Started(data)
                    if data.harness.as_deref() == Some("pi") && data.attempt == Some(1))
            })
            .expect("the started event");
        let exited = events
            .iter()
            .position(|event| matches!(&event.event, Event::Exited(data) if data.exit_code == 3))
            .expect("the exited event");
        assert!(started < exited, "{mode}: started before exited");
        if mode == "crash" {
            assert_eq!(
                result.expect_err("crash dies"),
                format!("run failed: task {TASK} of {FOLDER} died: crashed")
            );
            assert!(
                !events
                    .iter()
                    .any(|event| matches!(event.event, Event::ExitContinued(_))),
                "{mode}: no continuation"
            );
        } else {
            assert_eq!(
                result.expect("the result continues the task"),
                format!("Task {TASK} of {FOLDER} done\n")
            );
            let continued = events
                .iter()
                .position(|event| matches!(event.event, Event::ExitContinued(_)))
                .expect("the exit_continued event");
            assert!(exited < continued, "{mode}: continued after exited");
        }
    }
}

/// Proves the scope violation and frozen test outcomes.
///
/// Covers: rust-run/scope-outcomes
#[test]
fn scope_outcomes() {
    let (outside, result) = run_mode("scope-outside", "outside");
    assert_eq!(
        result.expect_err("the outside path kills the task"),
        format!("run failed: task {TASK} of {FOLDER} died: scope_violation")
    );
    assert_eq!(
        marker(&outside),
        "---\nreason: scope_violation\n---\nother.txt\n",
        "the outside marker"
    );
    let violation = events(&outside)
        .into_iter()
        .find_map(|envelope| match envelope.event {
            Event::ScopeViolation(data) => Some(data.files),
            _ => None,
        })
        .expect("the scope_violation event");
    assert_eq!(violation, vec!["other.txt".to_owned()]);

    let (frozen, result) = run_mode("scope-frozen", "frozen");
    assert_eq!(
        result.expect_err("the frozen test kills the task"),
        format!("run failed: task {TASK} of {FOLDER} died: undeclared_test_change")
    );
    assert!(
        marker(&frozen).contains("- src/tests/old.rs (modified)"),
        "the frozen marker lists the modified test"
    );

    let outside_root = repo("scope-modify-outside", "modify-outside");
    support::write(&outside_root, "other.txt", "before\n");
    let result = support::run(&outside_root, &[FOLDER, TASK]);
    assert_eq!(
        result
            .expect_err("the modified listed path is outside")
            .to_string(),
        format!("run failed: task {TASK} of {FOLDER} died: scope_violation")
    );

    let (added, result) = run_mode("scope-added-test", "added-test");
    assert_eq!(
        result.expect("an added test is allowed"),
        format!("Task {TASK} of {FOLDER} done\n")
    );
    assert!(support::exists(
        &added,
        &format!("openspec/changes/{FOLDER}/.run/done/{TASK}")
    ));

    let (deleted, result) = run_mode("scope-delete-test", "delete-test");
    assert_eq!(
        result.expect_err("the deleted frozen test kills the task"),
        format!("run failed: task {TASK} of {FOLDER} died: undeclared_test_change")
    );
    assert!(
        marker(&deleted).contains("- src/tests/old.rs (deleted)"),
        "the frozen marker lists the deleted test"
    );

    let (locks, result) = run_mode("scope-locks", "locks");
    assert_eq!(
        result.expect("a lock file may follow its manifest"),
        format!("Task {TASK} of {FOLDER} done\n")
    );
    assert!(support::exists(
        &locks,
        &format!("openspec/changes/{FOLDER}/.run/done/{TASK}")
    ));
}

/// Proves the usage limit failure text.
///
/// Covers: rust-run/run-outcomes
#[test]
fn usage_limit_text() {
    assert_eq!(
        source_text::usage_limit("1", "001-a"),
        "task 1 of 001-a paused on a usage limit"
    );
}

/// Proves the done marker, event, change verify event and ticked task.
///
/// Covers: rust-run/done-task
#[test]
fn done_task() {
    let (root, result) = run_mode("done-task", "done");
    assert_eq!(
        result.expect("the task is done"),
        format!("Task {TASK} of {FOLDER} done\n")
    );
    let stamp = support::read_text(
        &root,
        &format!("openspec/changes/{FOLDER}/.run/done/{TASK}"),
    );
    assert!(stamp.ends_with('\n'), "the done marker ends with a newline");
    assert_eq!(stamp.lines().count(), 1, "the done marker holds one time");
    assert_eq!(stamp.trim().len(), 24, "the done time has the fixed shape");
    let last = parse_event_line(&support::last_event(&root, TASK)).expect("the last event parses");
    match last.event {
        Event::Done(data) => assert_eq!(data.task, TASK),
        other => panic!("expected a done event, got {other:?}"),
    }
    let change = support::read_text(
        &root,
        &format!("openspec/changes/{FOLDER}/.run/events/change.jsonl"),
    );
    assert!(
        change
            .lines()
            .filter_map(|line| parse_event_line(line).ok())
            .any(|envelope| matches!(envelope.event, Event::VerifyRan(_))),
        "change.jsonl holds a verify_ran event"
    );
    assert_eq!(
        support::read_text(&root, &format!("openspec/changes/{FOLDER}/tasks.md")),
        "# Tasks\n\n## 1. A\n\n- [x] 1. When run, it works\n"
    );
}

/// Proves a start that hits its timeout dies as `timeout`.
///
/// Covers: rust-run/executor-exits
#[test]
fn start_timeout_dies() {
    let root = repo("start-timeout", "hang");
    support::write(
        &root,
        "osq.toml",
        format!(
            "[executor]\nharness = \"pi\"\n\n[pi]\nbin = \"{}\"\n\n[timeouts]\ntaskTimeoutSeconds = 1\n",
            fake_pi()
        ),
    );
    let result = support::run(&root, &[FOLDER, TASK]);
    assert_eq!(
        result.expect_err("the start times out").to_string(),
        format!("run failed: task {TASK} of {FOLDER} died: timeout")
    );
}

/// Proves a red verify marker keeps its timeout flag and the last 2000 bytes.
///
/// Covers: rust-run/run-outcomes
#[test]
fn verify_timeout_keeps_the_output_tail() {
    let root = repo("verify-timeout", "done");
    support::write(
        &root,
        "osq.toml",
        format!(
            "[executor]\nharness = \"pi\"\n\n[pi]\nbin = \"{}\"\n\n[timeouts]\ntaskTimeoutSeconds = 1\n",
            fake_pi()
        ),
    );
    support::write(
        &root,
        &format!("openspec/changes/{FOLDER}/tasks/{TASK}.md"),
        "---\ntitle: When run, it works\nverify: \"test \\\"$OSQ_CHANGE\\\" = openspec/changes/001-a || exit 9; yes é | head -c 3000; sleep 5\"\nscope:\n  - src/**\nentry: []\n---\n## Acceptance\n\n- [ ] When run, it works\n",
    );
    support::write_seal(&root);
    let result = support::run(&root, &[FOLDER, TASK]);
    assert_eq!(
        result.expect_err("the verify times out").to_string(),
        format!("run failed: task {TASK} of {FOLDER} died: verify_red")
    );
    let dead = marker(&root);
    assert!(dead.contains("timed_out: true"), "{dead}");
    let body = dead
        .split_once("---\nWatcher independent verify timed out:\n")
        .map(|(_, body)| body)
        .expect("the timeout body");
    assert_eq!(body.len(), 2000, "the output tail plus its newline");
    assert!(body.contains('é'), "the output tail keeps its characters");
}
