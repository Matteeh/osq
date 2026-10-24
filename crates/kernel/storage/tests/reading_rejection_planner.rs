//! Proves the rejection planner reader matches TypeScript's report input.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::read_rejection_planner;

/// A change stream holding only an archived event.
const ARCHIVED: &str = r#"{"type":"archived","timestamp":"2026-10-21T08:00:00.000Z","data":{}}"#;

/// A change stream holding a rejected event.
const REJECTED: &str =
    r#"{"type":"rejected","timestamp":"2026-10-21T08:00:00.000Z","data":{"reason":"x"}}"#;

/// A change stream holding a rejected event with no data.
const REJECTED_BARE: &str = r#"{"type":"rejected"}"#;

/// A brief whose planner is a plain name.
const BRIEF: &str = "---\nplanner: claude-opus\n---\n";

/// A brief whose planner is quoted with surrounding spaces.
const BRIEF_SPACES: &str = "---\nplanner: \" claude-opus \"\n---\n";

/// A brief whose planner is a number.
const BRIEF_NUMBER: &str = "---\nplanner: 7\n---\n";

/// A brief whose planner is quoted whitespace.
const BRIEF_BLANK: &str = "---\nplanner: \"  \"\n---\n";

/// One row of the "Rejection planners" table.
struct Row {
    /// The scratch folder's suffix and the assertion's label.
    name: &'static str,
    /// The `change.jsonl` lines, in order; empty for no event file.
    lines: &'static [&'static str],
    /// The brief to write, or no brief file.
    brief: Option<&'static str>,
    /// The planner the row expects.
    expected: Option<&'static str>,
}

/// Every "Rejection planners" row, in the table's order.
const ROWS: &[Row] = &[
    Row {
        name: "no-event-file",
        lines: &[],
        brief: Some(BRIEF),
        expected: None,
    },
    Row {
        name: "archived",
        lines: &[ARCHIVED],
        brief: Some(BRIEF),
        expected: None,
    },
    Row {
        name: "rejected",
        lines: &[REJECTED],
        brief: Some(BRIEF_SPACES),
        expected: Some("claude-opus"),
    },
    Row {
        name: "loose-lines",
        lines: &["not json", REJECTED_BARE],
        brief: None,
        expected: Some("unknown"),
    },
    Row {
        name: "numeric-planner",
        lines: &[REJECTED_BARE],
        brief: Some(BRIEF_NUMBER),
        expected: Some("unknown"),
    },
    Row {
        name: "blank-planner",
        lines: &[REJECTED_BARE],
        brief: Some(BRIEF_BLANK),
        expected: Some("unknown"),
    },
];

/// A fresh change folder under `CARGO_TARGET_TMPDIR`.
fn scratch(name: &str) -> PathBuf {
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("reading_rejection_planner")
        .join("rejection_planners")
        .join(name);
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).expect("the scratch change folder is created");
    folder
}

/// Writes the row's change stream and brief into `folder`.
fn write_row(folder: &Path, row: &Row) {
    if !row.lines.is_empty() {
        let events = folder.join(".run").join("events");
        fs::create_dir_all(&events).expect("the events folder is created");
        let mut content = row.lines.join("\n");
        content.push('\n');
        fs::write(events.join("change.jsonl"), content).expect("the event file is written");
    }
    if let Some(brief) = row.brief {
        fs::write(folder.join("brief.md"), brief).expect("the brief is written");
    }
}

/// Proves every row of the "Rejection planners" table.
///
/// Covers: rust-storage/rejection-planners
#[test]
fn rejection_planners() {
    for row in ROWS {
        let folder = scratch(row.name);
        write_row(&folder, row);
        assert_eq!(
            read_rejection_planner(&folder).as_deref(),
            row.expected,
            "{}",
            row.name
        );
    }
}
