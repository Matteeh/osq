//! Proves the run verdict's verify logs, event tails and marker excerpts.

mod support;

#[allow(dead_code)]
#[path = "../src/feature/output.rs"]
mod source_output;

use std::path::{Path, PathBuf};

use osq_core::event::{Event, VerifyRanData, parse_event_line};

use support::{FOLDER, TASK};

/// One "Verify output from the config" row.
struct Row {
    /// A folder name unique to the row.
    name: &'static str,
    /// The row's `osq.toml` tables.
    settings: &'static str,
    /// The shell text the row's verify runs.
    command: &'static str,
    /// Whether the row rewrites the proposal's verify instead of the task's.
    proposal: bool,
    /// The reason the task dies with.
    reason: &'static str,
    /// The dead marker's body.
    body: &'static str,
    /// The stream whose last `verify_ran` event the row checks.
    stream: &'static str,
    /// The event's `output`, or none.
    output: Option<&'static str>,
    /// The log's name under `.run/logs`.
    log: &'static str,
    /// The command's whole output.
    full: &'static str,
}

/// Every "Verify output from the config" row, in the table's order.
const ROWS: &[Row] = &[
    Row {
        name: "tail-limits",
        settings: "[limits]\nmarkerOutputLines = 2\nmarkerLineChars = 5\n",
        command: r"printf 'one\ntwo\nthree-long\n'; exit 1",
        proposal: false,
        reason: "verify_red",
        body: "Watcher independent verify failed:\ntwo\nthree… (5 more characters)\nFull output: .run/logs/1-1.log\n",
        stream: "1.jsonl",
        output: Some("two\nthree… (5 more characters)"),
        log: "1-1.log",
        full: "one\ntwo\nthree-long\n",
    },
    Row {
        name: "tail-defaults",
        settings: "",
        command: r"printf 'ok\n'; exit 1",
        proposal: false,
        reason: "verify_red",
        body: "Watcher independent verify failed:\nok\nFull output: .run/logs/1-1.log\n",
        stream: "1.jsonl",
        output: Some("ok\n"),
        log: "1-1.log",
        full: "ok\n",
    },
    Row {
        name: "no-output",
        settings: "",
        command: "exit 1",
        proposal: false,
        reason: "verify_red",
        body: "Watcher independent verify failed:\nProcess exited with code 1\nFull output: .run/logs/1-1.log\n",
        stream: "1.jsonl",
        output: None,
        log: "1-1.log",
        full: "",
    },
    Row {
        name: "failing-tests",
        settings: "[limits]\nmarkerOutputLines = 1\n",
        command: r"printf 'a\n✖ failing tests:\nb\nc\n'; exit 1",
        proposal: false,
        reason: "verify_red",
        body: "Watcher independent verify failed:\n✖ failing tests:\nb\nc\nFull output: .run/logs/1-1.log\n",
        stream: "1.jsonl",
        output: Some("c"),
        log: "1-1.log",
        full: "a\n✖ failing tests:\nb\nc\n",
    },
    Row {
        name: "timeout-tail",
        settings: "[limits]\nmarkerOutputLines = 2\n\n[timeouts]\ntaskTimeoutSeconds = 1\n",
        command: r"printf 'x\ny\nz\n'; sleep 5",
        proposal: false,
        reason: "verify_red",
        body: "Watcher independent verify timed out:\ny\nz\nFull output: .run/logs/1-1.log\n",
        stream: "1.jsonl",
        output: Some("y\nz"),
        log: "1-1.log",
        full: "x\ny\nz\n",
    },
    Row {
        name: "change-tail",
        settings: "[limits]\nmarkerOutputLines = 2\n",
        command: r"printf 'one\ntwo\nthree\n'; exit 2",
        proposal: true,
        reason: "change_verify_red",
        body: "Change-level verification failed after task verification passed.\ntwo\nthree\nFull output: .run/logs/change-1.log\n",
        stream: "change.jsonl",
        output: Some("two\nthree"),
        log: "change-1.log",
        full: "one\ntwo\nthree\n",
    },
];

/// The fake pi's executable path, made absolute for `pi.bin`.
fn fake_pi() -> String {
    support::fixture("fake-pi")
        .join("run.sh")
        .to_string_lossy()
        .into_owned()
}

/// A YAML double-quoted scalar holding `text` unchanged.
fn quote(text: &str) -> String {
    text.replace('\\', "\\\\").replace('"', "\\\"")
}

/// A task file whose verify runs `command`.
fn task_markdown(command: &str) -> String {
    format!(
        "---\ntitle: When run, it works\nverify: \"{}\"\nscope:\n  - src/**\nentry: []\n---\n## Acceptance\n\n- [ ] When run, it works\n",
        quote(command)
    )
}

/// A proposal whose change verify runs `command`.
fn proposal_markdown(command: &str) -> String {
    format!(
        "---\ntitle: A change\nverify: \"{}\"\n---\n## Goal\n\nA change.\n",
        quote(command)
    )
}

/// A committed fixture whose task or proposal verifies with the row's command.
fn repo(row: &Row) -> PathBuf {
    let root = support::repo(row.name);
    let config = format!(
        "[executor]\nharness = \"pi\"\n\n[pi]\nbin = \"{}\"\n\n{}",
        fake_pi(),
        row.settings
    );
    support::write(&root, "osq.toml", config);
    support::write(&root, "fake-pi-mode", "done");
    if row.proposal {
        support::write(
            &root,
            &format!("openspec/changes/{FOLDER}/proposal.md"),
            proposal_markdown(row.command),
        );
    } else {
        support::write(
            &root,
            &format!("openspec/changes/{FOLDER}/tasks/{TASK}.md"),
            task_markdown(row.command),
        );
    }
    support::write_seal(&root);
    root
}

/// The text after the dead marker's closing `---` line.
fn body(root: &Path) -> String {
    let marker = support::read_text(
        root,
        &format!("openspec/changes/{FOLDER}/.run/dead/{TASK}.md"),
    );
    marker
        .split_once("\n---\n")
        .map(|(_, body)| body.to_owned())
        .expect("the marker has a closing delimiter")
}

/// The last `verify_ran` event of a stream.
fn last_verify(root: &Path, stream: &str) -> VerifyRanData {
    let text = support::read_text(
        root,
        &format!("openspec/changes/{FOLDER}/.run/events/{stream}"),
    );
    text.lines()
        .filter_map(|line| parse_event_line(line).ok())
        .filter_map(|envelope| match envelope.event {
            Event::VerifyRan(data) => Some(data),
            _ => None,
        })
        .next_back()
        .expect("the stream holds a verify_ran event")
}

/// Proves every row of the "Verify output from the config" table.
///
/// Covers: rust-run/verify-output-from-the-config
#[test]
fn verify_output_from_the_config() {
    for row in ROWS {
        let root = repo(row);
        let result = support::run(&root, &[FOLDER, TASK]);
        assert_eq!(
            result.expect_err("the row dies").to_string(),
            format!("run failed: task {TASK} of {FOLDER} died: {}", row.reason),
            "{}",
            row.name
        );
        assert_eq!(body(&root), row.body, "{}", row.name);
        let event = last_verify(&root, row.stream);
        let event_log = format!(".run/logs/{}", row.log);
        assert_eq!(
            event.log.as_deref(),
            Some(event_log.as_str()),
            "{}",
            row.name
        );
        assert_eq!(event.output.as_deref(), row.output, "{}", row.name);
        assert_eq!(
            support::read_text(
                &root,
                &format!("openspec/changes/{FOLDER}/.run/logs/{}", row.log)
            ),
            row.full,
            "{}: the log holds the whole output",
            row.name
        );
        assert_eq!(
            support::read_text(
                &root,
                &format!("openspec/changes/{FOLDER}/.run/logs/.gitignore")
            ),
            "*\n",
            "{}: the logs folder ignores its files",
            row.name
        );
    }
}

/// Proves the excerpt and tail rules at their boundaries.
///
/// Covers: rust-run/verify-output-from-the-config
#[test]
fn excerpt_and_tail_edges() {
    assert_eq!(source_output::tail_verify_output("", 40, 400), "");
    assert_eq!(source_output::tail_verify_output(" \n\t\n", 40, 400), "");
    assert_eq!(source_output::tail_verify_output("ok\n", 40, 400), "ok\n");
    assert_eq!(
        source_output::tail_verify_output("a\nbb\nccc\n", 2, 2),
        "bb\ncc… (1 more characters)"
    );
    assert_eq!(
        source_output::tail_verify_output("ok\nlong\n", 2, 2),
        "ok\nlo… (2 more characters)"
    );
    assert_eq!(
        source_output::tail_verify_output("ééé\n", 1, 2),
        "éé… (1 more characters)"
    );
    assert_eq!(
        source_output::excerpt_verify_output("", "the log", 40, 400),
        "(no output)\nFull output: the log"
    );
    assert_eq!(
        source_output::excerpt_verify_output("a\nb\nccc\n", "the log", 2, 2),
        "b\ncc… (1 more characters)\nFull output: the log"
    );
    assert_eq!(
        source_output::excerpt_verify_output("a\n  ✖ failing tests: x\nb\nc\n", "the log", 1, 400),
        "  ✖ failing tests: x\nb\nc\nFull output: the log"
    );
}

/// Proves an empty proposal output becomes `(no output)` in its marker.
///
/// Covers: rust-run/verify-output-from-the-config
#[test]
fn empty_change_output() {
    let row = Row {
        name: "empty-change",
        settings: "",
        command: "exit 2",
        proposal: true,
        reason: "change_verify_red",
        body: "Change-level verification failed after task verification passed.\n(no output)\nFull output: .run/logs/change-1.log\n",
        stream: "change.jsonl",
        output: None,
        log: "change-1.log",
        full: "",
    };
    let root = repo(&row);
    let result = support::run(&root, &[FOLDER, TASK]);
    assert_eq!(
        result.expect_err("the change verify dies").to_string(),
        format!("run failed: task {TASK} of {FOLDER} died: change_verify_red")
    );
    assert_eq!(body(&root), row.body);
    assert_eq!(last_verify(&root, row.stream).output, None);
}

/// Proves the log count keeps only `<target>-<digits>.log` files.
///
/// Covers: rust-run/verify-output-from-the-config
#[test]
fn log_count_skips_other_names() {
    let row = Row {
        name: "log-count",
        settings: "",
        command: r"printf 'x\n'; exit 1",
        proposal: false,
        reason: "verify_red",
        body: "Watcher independent verify failed:\nx\nFull output: .run/logs/1-3.log\n",
        stream: "1.jsonl",
        output: Some("x\n"),
        log: "1-3.log",
        full: "x\n",
    };
    let root = support::repo(row.name);
    let logs = format!("openspec/changes/{FOLDER}/.run/logs");
    for name in [
        "1-1.log",
        "1-7.log",
        "change-1.log",
        "1-a.log",
        "1-2.log.bak",
    ] {
        support::write(&root, &format!("{logs}/{name}"), "old\n");
    }
    support::write(&root, &format!("{logs}/1-4.log/keep"), "");
    support::write(
        &root,
        "osq.toml",
        format!(
            "[executor]\nharness = \"pi\"\n\n[pi]\nbin = \"{}\"\n",
            fake_pi()
        ),
    );
    support::write(&root, "fake-pi-mode", "done");
    support::write(
        &root,
        &format!("openspec/changes/{FOLDER}/tasks/{TASK}.md"),
        task_markdown(row.command),
    );
    support::write_seal(&root);
    let result = support::run(&root, &[FOLDER, TASK]);
    assert_eq!(
        result.expect_err("the task verify dies").to_string(),
        format!("run failed: task {TASK} of {FOLDER} died: verify_red")
    );
    assert_eq!(body(&root), row.body);
    assert_eq!(
        support::read_text(&root, &format!("{logs}/{}", row.log)),
        row.full
    );
}
