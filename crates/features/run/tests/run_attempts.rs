//! Proves the run reads a task's retry context and hands it to pi.

mod support;

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::event::{Event, parse_event_line};
use osq_feature_run::{PriorAttempt, executor_prompt};

use support::{FOLDER, TASK};

/// A `retry 2` event line.
const RETRY_LINE: &str = r#"{"timestamp":"2026-01-01T00:00:00.000Z","type":"retry","data":{"target":"1","reason":"verify_red","attempt":2}}"#;

/// A retry line whose attempt is one past `u32::MAX`.
const HUGE_RETRY_LINE: &str = r#"{"timestamp":"2026-01-01T00:00:00.000Z","type":"retry","data":{"target":"1","reason":"verify_red","attempt":4294967296}}"#;

/// A requeued recertification event line.
const REQUEUED_LINE: &str = r#"{"timestamp":"2026-01-01T00:00:00.000Z","type":"recertification","data":{"task":"1","outcome":"requeued","differingPaths":["src/a.rs"],"attribution":{},"command":"cargo test","exitCode":1,"timedOut":false,"recordedHash":"a","currentHash":"b","attempt":3,"reason":"scope_regression","output":"fail\n"}}"#;

/// The dead marker a retry keeps.
const MARKER: &str = "---\nreason: verify_red\n---\nerror: one\n";

/// One row of the "Prior context handed to pi" table.
struct Row {
    /// The scratch folder's suffix and the assertion's label.
    name: &'static str,
    /// The event file's lines, in order; empty for no event file.
    lines: &'static [&'static str],
    /// The dead markers to write, as name and content.
    markers: &'static [(&'static str, &'static str)],
    /// The attempt the started event carries.
    attempt: u64,
    /// The prior failure reason the prompt carries.
    reason: Option<&'static str>,
    /// The prior failure output the prompt carries.
    output: Option<&'static str>,
    /// The prior context lines the prompt holds.
    context: &'static [&'static str],
}

/// Every "Prior context handed to pi" row, in the table's order.
const ROWS: &[Row] = &[
    Row {
        name: "attempts-first",
        lines: &[],
        markers: &[],
        attempt: 1,
        reason: None,
        output: None,
        context: &[],
    },
    Row {
        name: "attempts-retry",
        lines: &[RETRY_LINE],
        markers: &[("1.1.md", MARKER)],
        attempt: 2,
        reason: Some("verify_red"),
        output: Some("error: one\n"),
        context: &[
            "Prior Context:",
            "- Prior Attempt: 2",
            "- Prior Failure: verify_red",
            "- Prior Failure Output:",
            "  error: one",
        ],
    },
    Row {
        name: "attempts-requeued",
        lines: &[REQUEUED_LINE],
        markers: &[],
        attempt: 3,
        reason: Some("scope_regression"),
        output: Some("fail\n"),
        context: &[
            "Prior Context:",
            "- Prior Attempt: 3",
            "- Prior Failure: scope_regression",
            "- Prior Failure Output:",
            "  fail",
        ],
    },
];

/// The fake pi's executable path, made absolute for `pi.bin`.
fn record_pi() -> String {
    support::fixture("record-pi")
        .join("run.sh")
        .to_string_lossy()
        .into_owned()
}

/// A fresh committed run fixture whose config names the recording fake pi.
fn repo(name: &str) -> PathBuf {
    let root = support::repo(name);
    let config = format!(
        "[executor]\nharness = \"pi\"\n\n[pi]\nbin = \"{}\"\n",
        record_pi()
    );
    support::write(&root, "osq.toml", config);
    support::write_seal(&root);
    root
}

/// Writes the row's event lines and dead markers into the change folder.
fn write_row(root: &Path, row: &Row) {
    let change = support::change(root);
    if !row.lines.is_empty() {
        let events = change.join(".run").join("events");
        fs::create_dir_all(&events).expect("the events folder is created");
        let mut content = row.lines.join("\n");
        content.push('\n');
        fs::write(events.join(format!("{TASK}.jsonl")), content)
            .expect("the event file is written");
    }
    for (name, content) in row.markers {
        let dead = change.join(".run").join("dead");
        fs::create_dir_all(&dead).expect("the dead folder is created");
        fs::write(dead.join(name), content).expect("the dead marker is written");
    }
}

/// The path the fake pi saves its prompt at, beside the project folder.
fn saved_prompt_path(root: &Path) -> PathBuf {
    let parent = root.parent().expect("the project folder has a parent");
    let name = root
        .file_name()
        .expect("the project folder has a name")
        .to_string_lossy();
    parent.join(format!("{name}.prompt"))
}

/// The attempt of the task's `started` event.
fn started_attempt(root: &Path) -> Option<u64> {
    support::read_text(
        root,
        &format!("openspec/changes/{FOLDER}/.run/events/{TASK}.jsonl"),
    )
    .lines()
    .filter_map(|line| parse_event_line(line).ok())
    .find_map(|envelope| match envelope.event {
        Event::Started(data) => data.attempt,
        _ => None,
    })
}

/// The `Prior Context:` line and its lines up to the next blank line.
fn context_lines(prompt: &str) -> Vec<String> {
    let marker = "\nPrior Context:\n";
    let Some(start) = prompt.find(marker) else {
        return Vec::new();
    };
    prompt[start + 1..]
        .lines()
        .take_while(|line| !line.is_empty())
        .filter(|line| !line.trim().is_empty())
        .map(str::to_owned)
        .collect()
}

/// Proves every row of the "Prior context handed to pi" table.
///
/// Covers: rust-run/prior-context-handed-to-pi
#[test]
fn prior_context_handed_to_pi() {
    for row in ROWS {
        let root = repo(row.name);
        write_row(&root, row);
        let prior = PriorAttempt {
            attempt: u32::try_from(row.attempt).expect("the row's attempt fits u32"),
            reason: row.reason.map(str::to_owned),
            output: row.output.map(str::to_owned),
        };
        let expected = executor_prompt(&root, &support::change(&root), TASK, &prior)
            .expect("the expected prompt builds");
        let result = support::run(&root, &[FOLDER, TASK]).expect("the task is done");
        assert_eq!(
            result.text,
            format!("Task {TASK} of {FOLDER} done\n"),
            "{}",
            row.name
        );
        assert_eq!(started_attempt(&root), Some(row.attempt), "{}", row.name);
        let saved =
            fs::read_to_string(saved_prompt_path(&root)).expect("the fake pi saved its prompt");
        assert_eq!(saved, expected, "{}", row.name);
        assert_eq!(context_lines(&saved), row.context, "{}", row.name);
    }
}

/// Proves the prompt's attempt is capped at `u32::MAX` while `started` keeps u64.
///
/// Covers: rust-run/prior-context-handed-to-pi
#[test]
fn attempt_cap() {
    let root = repo("attempts-capped");
    let row = Row {
        name: "attempts-capped",
        lines: &[HUGE_RETRY_LINE],
        markers: &[],
        attempt: 4_294_967_296,
        reason: Some("verify_red"),
        output: None,
        context: &[],
    };
    write_row(&root, &row);
    let prior = PriorAttempt {
        attempt: u32::MAX,
        reason: row.reason.map(str::to_owned),
        output: None,
    };
    let expected = executor_prompt(&root, &support::change(&root), TASK, &prior)
        .expect("the expected prompt builds");
    support::run(&root, &[FOLDER, TASK]).expect("the task is done");
    assert_eq!(started_attempt(&root), Some(row.attempt));
    let saved = fs::read_to_string(saved_prompt_path(&root)).expect("the fake pi saved its prompt");
    assert_eq!(saved, expected);
}
