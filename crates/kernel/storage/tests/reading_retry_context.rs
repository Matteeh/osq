//! Proves the retry context reader matches TypeScript's `readRetryContext`.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{RetryContext, read_retry_context};

/// The task every row reads.
const TASK: &str = "1";

/// The dead marker TypeScript keeps for a retry.
const MARKER: &str = "---\nreason: verify_red\n---\nerror: one\n";

/// The dead marker with ANSI codes in its body.
const ANSI_MARKER: &str = "---\nreason: verify_red\n---\n\u{1b}[31merror\u{1b}[0m: red\n\u{1b}]8;;http://x\u{7}link\u{1b}]8;;\u{7}\n";

/// A dead marker with every complete ANSI sequence form in the grammar.
const ANSI_EDGE_MARKER: &str = "---\nreason: verify_red\n---\n\u{1b}[?25la\u{1b}[1;31mb\u{1b}[1 qc\u{1b}]0;title\u{1b}\\\u{1b}]0;title\u{1b}\u{1b}\\d\n";

/// A dead marker whose invalid and unfinished sequences are kept.
const ANSI_INVALID_MARKER: &str =
    "---\nreason: verify_red\n---\na\u{1b}Xb\u{1b}[1\nc\u{1b}]unterminated\u{1b}\n";

/// A dead marker that ends in a lone escape byte.
const ANSI_END_MARKER: &str = "---\nreason: verify_red\n---\na\u{1b}\n";

/// A `retry 2` line.
const RETRY_2: &str = r#"{"type":"retry","data":{"target":"1","reason":"verify_red","attempt":2}}"#;

/// A `retry 3` line.
const RETRY_3: &str = r#"{"type":"retry","data":{"target":"1","reason":"verify_red","attempt":3}}"#;

/// A `retry` line whose attempt is not a whole number.
const RETRY_FRACTION: &str =
    r#"{"type":"retry","data":{"target":"1","reason":"verify_red","attempt":2.5}}"#;

/// A `retry` line with an empty reason.
const RETRY_EMPTY_REASON: &str =
    r#"{"type":"retry","data":{"target":"1","reason":"","attempt":2}}"#;

/// A requeued recertification carrying an attempt, a reason and an output.
const REQUEUED: &str = r#"{"type":"recertification","data":{"task":"1","outcome":"requeued","differingPaths":["src/a.rs"],"attribution":{},"command":"cargo test","exitCode":1,"timedOut":false,"recordedHash":"a","currentHash":"b","attempt":3,"reason":"scope_regression","output":"fail\n"}}"#;

/// A requeued recertification carrying only an attempt and an output.
const REQUEUED_OUTPUT: &str = r#"{"type":"recertification","data":{"task":"1","outcome":"requeued","differingPaths":["src/a.rs"],"attribution":{},"command":"cargo test","exitCode":1,"timedOut":false,"recordedHash":"a","currentHash":"b","attempt":2,"output":"fail"}}"#;

/// A requeued recertification carrying an attempt, a reason and no output.
const REQUEUED_REASON: &str = r#"{"type":"recertification","data":{"task":"1","outcome":"requeued","differingPaths":["src/a.rs"],"attribution":{},"command":"cargo test","exitCode":1,"timedOut":false,"recordedHash":"a","currentHash":"b","attempt":3,"reason":"scope_regression"}}"#;

/// A requeued recertification carrying an attempt and an output.
const REQUEUED_X: &str = r#"{"type":"recertification","data":{"task":"1","outcome":"requeued","differingPaths":["src/a.rs"],"attribution":{},"command":"cargo test","exitCode":1,"timedOut":false,"recordedHash":"a","currentHash":"b","attempt":3,"output":"x"}}"#;

/// A requeued recertification with an empty output.
const REQUEUED_EMPTY_OUTPUT: &str = r#"{"type":"recertification","data":{"task":"1","outcome":"requeued","differingPaths":["src/a.rs"],"attribution":{},"command":"cargo test","exitCode":1,"timedOut":false,"recordedHash":"a","currentHash":"b","attempt":2,"output":""}}"#;

/// A requeued recertification with a whitespace output.
const REQUEUED_SPACE_OUTPUT: &str = r#"{"type":"recertification","data":{"task":"1","outcome":"requeued","differingPaths":["src/a.rs"],"attribution":{},"command":"cargo test","exitCode":1,"timedOut":false,"recordedHash":"a","currentHash":"b","attempt":2,"output":"  \n"}}"#;

/// A passed recertification, which never advances attempts.
const PASSED: &str = r#"{"type":"recertification","data":{"task":"1","outcome":"passed","differingPaths":["src/a.rs"],"attribution":{},"command":"cargo test","exitCode":1,"timedOut":false,"recordedHash":"a","currentHash":"b","attempt":5,"reason":"scope_regression","output":"fail\n"}}"#;

/// One row of the "Retry contexts" table.
struct Row {
    /// The scratch folder's suffix and the assertion's label.
    name: &'static str,
    /// The event file's lines, in order; empty for no event file.
    lines: &'static [&'static str],
    /// The dead markers to write, as name and content.
    markers: &'static [(&'static str, &'static str)],
    /// The attempt the row expects.
    attempt: u64,
    /// The reason the row expects.
    reason: Option<&'static str>,
    /// The output the row expects.
    output: Option<&'static str>,
}

/// Every "Retry contexts" row, in the table's order.
const ROWS: &[Row] = &[
    Row {
        name: "no-event-file",
        lines: &[],
        markers: &[],
        attempt: 1,
        reason: None,
        output: None,
    },
    Row {
        name: "retry-marker",
        lines: &[RETRY_2],
        markers: &[("1.1.md", MARKER)],
        attempt: 2,
        reason: Some("verify_red"),
        output: Some("error: one\n"),
    },
    Row {
        name: "retry-no-marker",
        lines: &[RETRY_2],
        markers: &[],
        attempt: 2,
        reason: Some("verify_red"),
        output: None,
    },
    Row {
        name: "retry-ansi",
        lines: &[RETRY_2],
        markers: &[("1.1.md", ANSI_MARKER)],
        attempt: 2,
        reason: Some("verify_red"),
        output: Some("error: red\nlink\n"),
    },
    Row {
        name: "requeued",
        lines: &[REQUEUED],
        markers: &[],
        attempt: 3,
        reason: Some("scope_regression"),
        output: Some("fail\n"),
    },
    Row {
        name: "passed",
        lines: &[PASSED],
        markers: &[],
        attempt: 1,
        reason: None,
        output: None,
    },
    Row {
        name: "requeued-output-wins",
        lines: &[RETRY_2, REQUEUED_X],
        markers: &[("1.1.md", MARKER)],
        attempt: 3,
        reason: Some("verify_red"),
        output: Some("x"),
    },
    Row {
        name: "retry-wins",
        lines: &[REQUEUED_OUTPUT, RETRY_3],
        markers: &[],
        attempt: 3,
        reason: Some("verify_red"),
        output: None,
    },
    Row {
        name: "requeued-keeps-output",
        lines: &[RETRY_2, REQUEUED_REASON],
        markers: &[("1.1.md", MARKER)],
        attempt: 3,
        reason: Some("scope_regression"),
        output: Some("error: one\n"),
    },
    Row {
        name: "loose-lines",
        lines: &["", "not json", "[1]", "   ", RETRY_2],
        markers: &[("1.1.md", "no frontmatter\n")],
        attempt: 2,
        reason: Some("verify_red"),
        output: Some("no frontmatter\n"),
    },
    Row {
        name: "fractional-attempt",
        lines: &[RETRY_FRACTION],
        markers: &[("1.0.md", "---\nreason: verify_red\n---\nzero\n")],
        attempt: 1,
        reason: Some("verify_red"),
        output: Some("zero\n"),
    },
    Row {
        name: "empty-reason",
        lines: &[RETRY_EMPTY_REASON],
        markers: &[],
        attempt: 2,
        reason: None,
        output: None,
    },
    Row {
        name: "empty-requeued-output",
        lines: &[REQUEUED_EMPTY_OUTPUT],
        markers: &[],
        attempt: 2,
        reason: None,
        output: None,
    },
    Row {
        name: "space-requeued-output",
        lines: &[REQUEUED_SPACE_OUTPUT],
        markers: &[],
        attempt: 2,
        reason: None,
        output: Some("  \n"),
    },
];

/// Proves the ANSI parameter, intermediate and OSC terminator forms.
///
/// Covers: rust-storage/retry-contexts
#[test]
fn ansi_edges() {
    let folder = scratch("ansi-edges");
    let row = Row {
        name: "ansi-edges",
        lines: &[RETRY_2],
        markers: &[("1.1.md", ANSI_EDGE_MARKER)],
        attempt: 2,
        reason: Some("verify_red"),
        output: Some("abcd\n"),
    };
    write_row(&folder, &row);
    assert_eq!(
        read_retry_context(&folder, TASK).output.as_deref(),
        Some("abcd\n")
    );
}

/// Proves that invalid and unfinished ANSI sequences keep their bytes.
///
/// Covers: rust-storage/retry-contexts
#[test]
fn ansi_incomplete() {
    let rows = [
        (
            "ansi-invalid",
            ANSI_INVALID_MARKER,
            "a\u{1b}Xb\u{1b}[1\nc\u{1b}]unterminated\u{1b}\n",
        ),
        ("ansi-end", ANSI_END_MARKER, "a\u{1b}\n"),
    ];
    for (name, marker, output) in rows {
        let folder = scratch(name);
        let events = folder.join(".run").join("events");
        fs::create_dir_all(&events).expect("the events folder is created");
        fs::write(events.join("1.jsonl"), format!("{RETRY_2}\n"))
            .expect("the event file is written");
        let dead = folder.join(".run").join("dead");
        fs::create_dir_all(&dead).expect("the dead folder is created");
        fs::write(dead.join("1.1.md"), marker).expect("the dead marker is written");
        assert_eq!(
            read_retry_context(&folder, TASK).output.as_deref(),
            Some(output),
            "{name}"
        );
    }
}

/// A fresh change folder under `CARGO_TARGET_TMPDIR`, named `name`.
fn scratch(name: &str) -> PathBuf {
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("retry_context")
        .join(name);
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).expect("the scratch change folder is created");
    folder
}

/// Writes the row's event lines and dead markers into `folder`.
fn write_row(folder: &Path, row: &Row) {
    if !row.lines.is_empty() {
        let events = folder.join(".run").join("events");
        fs::create_dir_all(&events).expect("the events folder is created");
        let mut content = row.lines.join("\n");
        content.push('\n');
        fs::write(events.join("1.jsonl"), content).expect("the event file is written");
    }
    for (name, content) in row.markers {
        let dead = folder.join(".run").join("dead");
        fs::create_dir_all(&dead).expect("the dead folder is created");
        fs::write(dead.join(name), content).expect("the dead marker is written");
    }
}

/// Proves every row of the "Retry contexts" table.
///
/// Covers: rust-storage/retry-contexts
#[test]
fn retry_contexts() {
    for row in ROWS {
        let folder = scratch(row.name);
        write_row(&folder, row);
        let expected = RetryContext {
            attempt: row.attempt,
            reason: row.reason.map(str::to_owned),
            output: row.output.map(str::to_owned),
        };
        assert_eq!(read_retry_context(&folder, TASK), expected, "{}", row.name);
    }
}
