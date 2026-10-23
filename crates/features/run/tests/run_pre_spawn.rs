//! Proves the pre-spawn verify the run feature performs on a first attempt.

mod support;

#[allow(dead_code)]
#[path = "../src/feature/named.rs"]
mod source_named;

use std::path::{Path, PathBuf};

use osq_core::event::{Event, VerifyRanData, parse_event_line};

use support::{FOLDER, TASK};

/// A `retry 2` event line.
const RETRY_LINE: &str = r#"{"timestamp":"2026-01-01T00:00:00.000Z","type":"retry","data":{"target":"1","reason":"verify_red","attempt":2}}"#;

/// The dead marker a retry keeps.
const RETRY_MARKER: &str = "---\nreason: verify_red\n---\nerror: one\n";

/// One "Pre-spawn verify outcomes" row.
struct OutcomeRow {
    /// The scratch folder's suffix and the assertion's label.
    name: &'static str,
    /// The task's `verify_starts`.
    start: &'static str,
    /// The task's verify command.
    verify: &'static str,
    /// Whether the start mismatches.
    mismatch: bool,
    /// The event's missing paths, or none.
    missing: Option<&'static [&'static str]>,
    /// The dead reason, or none when the task is done.
    reason: Option<&'static str>,
}

/// Every "Pre-spawn verify outcomes" row, in the table's order.
const OUTCOMES: &[OutcomeRow] = &[
    OutcomeRow {
        name: "pre-red-fails",
        start: "red",
        verify: "test -f src/a.txt",
        mismatch: false,
        missing: Some(&["src/a.txt"]),
        reason: None,
    },
    OutcomeRow {
        name: "pre-red-passes",
        start: "red",
        verify: "true",
        mismatch: true,
        missing: None,
        reason: Some("verify_precondition"),
    },
    OutcomeRow {
        name: "pre-red-missing-path",
        start: "red",
        verify: "true src/a.txt",
        mismatch: false,
        missing: Some(&["src/a.txt"]),
        reason: None,
    },
    OutcomeRow {
        name: "pre-red-pattern-present",
        start: "red",
        verify: "true src/*.txt",
        mismatch: true,
        missing: None,
        reason: Some("verify_precondition"),
    },
    OutcomeRow {
        name: "pre-red-pattern-absent",
        start: "red",
        verify: "true src/gen/*.rs",
        mismatch: false,
        missing: Some(&["src/gen/*.rs"]),
        reason: None,
    },
    OutcomeRow {
        name: "pre-green-passes",
        start: "green",
        verify: "true",
        mismatch: false,
        missing: None,
        reason: None,
    },
    OutcomeRow {
        name: "pre-green-fails",
        start: "green",
        verify: "test -f src/a.txt",
        mismatch: true,
        missing: Some(&["src/a.txt"]),
        reason: Some("verify_precondition"),
    },
    OutcomeRow {
        name: "pre-green-missing-path",
        start: "green",
        verify: "true src/a.txt",
        mismatch: false,
        missing: Some(&["src/a.txt"]),
        reason: None,
    },
    OutcomeRow {
        name: "pre-any-passes",
        start: "any",
        verify: "true",
        mismatch: false,
        missing: None,
        reason: None,
    },
    OutcomeRow {
        name: "pre-any-fails",
        start: "any",
        verify: "test -f src/a.txt",
        mismatch: false,
        missing: Some(&["src/a.txt"]),
        reason: None,
    },
];

/// One "Pre-spawn marker" row.
struct MarkerRow {
    /// The scratch folder's suffix and the assertion's label.
    name: &'static str,
    /// The task's `verify_starts`.
    start: &'static str,
    /// The task's verify command.
    verify: &'static str,
    /// The dead marker's whole text.
    marker: &'static str,
}

/// Every "Pre-spawn marker" row, in the table's order.
const MARKERS: &[MarkerRow] = &[
    MarkerRow {
        name: "pre-marker-empty",
        start: "red",
        verify: "true",
        marker: "---\nreason: verify_precondition\ncommand: \"true\"\nexpected: red\nexit_code: 0\n---\nPre-spawn verify precondition not met (expected red, exit code 0):\n(no output)\nFull output: .run/logs/1-1.log\n",
    },
    MarkerRow {
        name: "pre-marker-output",
        start: "green",
        verify: "echo no; exit 3",
        marker: "---\nreason: verify_precondition\ncommand: \"echo no; exit 3\"\nexpected: green\nexit_code: 3\n---\nPre-spawn verify precondition not met (expected green, exit code 3):\nno\nFull output: .run/logs/1-1.log\n",
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

/// A task file whose verify runs `command` after starting `start`.
fn task_markdown(start: &str, command: &str) -> String {
    format!(
        "---\ntitle: When run, it works\nverify: \"{}\"\nverify_starts: {start}\nscope:\n  - src/**\nentry: []\n---\n## Acceptance\n\n- [ ] When run, it works\n",
        quote(command)
    )
}

/// A committed fixture whose task verifies with `command` and starts `start`.
fn repo(name: &str, start: &str, command: &str) -> PathBuf {
    let root = support::repo(name);
    let config = format!(
        "[executor]\nharness = \"pi\"\n\n[pi]\nbin = \"{}\"\n",
        fake_pi()
    );
    support::write(&root, "osq.toml", config);
    support::write(&root, "fake-pi-mode", "done");
    support::write(
        &root,
        &format!("openspec/changes/{FOLDER}/tasks/{TASK}.md"),
        task_markdown(start, command),
    );
    support::write_seal(&root);
    root
}

/// The task's `verify_ran` events.
fn verify_events(root: &Path) -> Vec<VerifyRanData> {
    support::read_text(
        root,
        &format!("openspec/changes/{FOLDER}/.run/events/{TASK}.jsonl"),
    )
    .lines()
    .filter_map(|line| parse_event_line(line).ok())
    .filter_map(|envelope| match envelope.event {
        Event::VerifyRan(data) => Some(data),
        _ => None,
    })
    .collect()
}

/// The first `verify_ran` event of the task's stream.
fn first_verify(root: &Path) -> VerifyRanData {
    verify_events(root)
        .into_iter()
        .next()
        .expect("the stream holds the pre-spawn verify_ran event")
}

/// The dead marker of task 1.
fn marker(root: &Path) -> String {
    support::read_text(
        root,
        &format!("openspec/changes/{FOLDER}/.run/dead/{TASK}.md"),
    )
}

/// The named paths as the event spells them, or none when the list is empty.
fn names(paths: &[&str]) -> Option<Vec<String>> {
    (!paths.is_empty()).then(|| paths.iter().map(|path| (*path).to_owned()).collect())
}

/// Proves every row of the "Pre-spawn verify outcomes" table.
///
/// Covers: rust-run/pre-spawn-verify-outcomes
#[test]
fn pre_spawn_verify_outcomes() {
    for row in OUTCOMES {
        let root = repo(row.name, row.start, row.verify);
        let result = support::run(&root, &[FOLDER, TASK]);
        match row.reason {
            Some(reason) => assert_eq!(
                result.expect_err("the row dies").to_string(),
                format!("run failed: task {TASK} of {FOLDER} died: {reason}"),
                "{}",
                row.name
            ),
            None => assert_eq!(
                result.expect("the row is done").text,
                format!("Task {TASK} of {FOLDER} done\n"),
                "{}",
                row.name
            ),
        }
        let event = first_verify(&root);
        assert_eq!(event.command, row.verify, "{}", row.name);
        assert_eq!(event.phase.as_deref(), Some("pre_spawn"), "{}", row.name);
        assert_eq!(event.expected.as_deref(), Some(row.start), "{}", row.name);
        assert_eq!(event.mismatch, Some(row.mismatch), "{}", row.name);
        let expected = row
            .missing
            .map(|paths| paths.iter().map(|path| (*path).to_owned()).collect());
        assert_eq!(event.missing_paths, expected, "{}", row.name);
        assert_eq!(
            event.log.as_deref(),
            Some(".run/logs/1-1.log"),
            "{}",
            row.name
        );
    }
}

/// Proves every row of the "Pre-spawn marker" table.
///
/// Covers: rust-run/pre-spawn-marker
#[test]
fn pre_spawn_marker() {
    for row in MARKERS {
        let root = repo(row.name, row.start, row.verify);
        let result = support::run(&root, &[FOLDER, TASK]);
        assert_eq!(
            result.expect_err("the row dies").to_string(),
            format!("run failed: task {TASK} of {FOLDER} died: verify_precondition"),
            "{}",
            row.name
        );
        assert_eq!(marker(&root), row.marker, "{}", row.name);
        assert!(
            !support::read_text(
                &root,
                &format!("openspec/changes/{FOLDER}/.run/events/{TASK}.jsonl")
            )
            .lines()
            .filter_map(|line| parse_event_line(line).ok())
            .any(|envelope| matches!(envelope.event, Event::Started(_))),
            "{}: pi never started",
            row.name
        );
    }
}

/// Proves every row of the "Pre-spawn named paths" table.
///
/// Covers: rust-run/pre-spawn-named-paths
#[test]
fn pre_spawn_named_paths() {
    let rows: &[(&str, &[&str])] = &[
        ("true src/a.txt src/a.txt", &["src/a.txt"]),
        (
            r#"true "src/b c.txt" 'src/d.txt'"#,
            &["src/b c.txt", "src/d.txt"],
        ),
        (
            "true --out=src/x.txt -o src/keep.txt /src/a.txt https://h/p.txt",
            &[],
        ),
        ("bin/check src/keep.txt", &["bin/check"]),
        ("true src/tests src/*.txt src/gen/*.rs", &["src/gen/*.rs"]),
    ];
    for (command, expected) in rows {
        let root = repo("pre-named", "any", command);
        let _ = support::run(&root, &[FOLDER, TASK]);
        assert_eq!(
            first_verify(&root).missing_paths,
            names(expected),
            "{command}"
        );
    }
}

/// Proves the tokenizer and naming rules behind "Pre-spawn named paths".
///
/// Covers: rust-run/pre-spawn-named-paths
#[test]
fn named_path_edges() {
    let root = support::scratch("pre-spawn-named-edges");
    support::write(&root, "src/keep.txt", "");
    support::write(&root, "src/tests/old.rs", "");
    let rows: &[(&str, &[&str])] = &[
        ("true", &[]),
        ("true \"\"", &[]),
        ("true -x/y", &[]),
        ("true /src/x", &[]),
        ("true KEY=src/x", &[]),
        ("true https://h/p.txt", &[]),
        ("true HTTPS://h/p.txt", &[]),
        ("true a+b.c-d://x/y", &[]),
        ("true a_://x/y", &["a_://x/y"]),
        ("true 1a://x/y", &["1a://x/y"]),
        ("true ://x/y", &["://x/y"]),
        ("true src\\a.txt", &["src\\a.txt"]),
        ("Cargo.toml", &[]),
        ("bin/check", &["bin/check"]),
        ("true src/keep.txt", &[]),
        ("true src/tests", &[]),
        ("true src/????.txt", &[]),
        ("true src/?.txt", &["src/?.txt"]),
        ("true src/gen/*.rs", &["src/gen/*.rs"]),
        ("true\u{feff}src/a.txt", &["src/a.txt"]),
        (
            "true 'src/a.txt' \"src/b c.txt\"",
            &["src/a.txt", "src/b c.txt"],
        ),
        ("true src/a.txt src/a.txt", &["src/a.txt"]),
    ];
    for (command, expected) in rows {
        assert_eq!(
            source_named::missing(&root, command),
            expected
                .iter()
                .map(|path| (*path).to_owned())
                .collect::<Vec<_>>(),
            "{command:?}"
        );
    }
}

/// Proves a later attempt runs no pre-spawn verify.
///
/// Covers: rust-run/pre-spawn-verify-on-a-later-attempt
#[test]
fn pre_spawn_verify_on_a_later_attempt() {
    let root = repo("pre-later", "red", "true");
    support::write(
        &root,
        &format!("openspec/changes/{FOLDER}/.run/events/{TASK}.jsonl"),
        format!("{RETRY_LINE}\n"),
    );
    support::write(
        &root,
        &format!("openspec/changes/{FOLDER}/.run/dead/1.1.md"),
        RETRY_MARKER,
    );
    let result = support::run(&root, &[FOLDER, TASK]);
    assert_eq!(
        result.expect("the task is done").text,
        format!("Task {TASK} of {FOLDER} done\n")
    );
    let events = verify_events(&root);
    assert!(
        events.iter().all(|event| event.phase.is_none()),
        "no event has a phase"
    );
    assert_eq!(
        events.last().expect("the task verify ran").log.as_deref(),
        Some(".run/logs/1-1.log")
    );
}
