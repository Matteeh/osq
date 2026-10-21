//! Proves reading one change folder into the facts a land needs.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{LandFacts, LandTask, read_land_facts};

/// One row of "Land facts pass over what they cannot use".
struct Row {
    /// The row's name, used for its temporary folder and its message.
    name: &'static str,
    /// The files to write, as paths relative to the folder and their contents.
    files: Vec<(&'static str, &'static str)>,
    /// The facts the row expects.
    expected: LandFacts,
}

/// The archived fixture change folder this change copies into the crate.
fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/land-change/001-alpha-orders")
}

/// A fresh temporary folder for one row, with nothing left at its name.
fn temp_folder(name: &str) -> PathBuf {
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("reading_land_facts")
        .join(name);
    let _ = fs::remove_dir_all(&folder);
    folder
}

/// Writes a row's files into its temporary folder, leaving it absent without files.
fn write_row(row: &Row) -> PathBuf {
    let folder = temp_folder(row.name);
    for (path, content) in &row.files {
        let target = folder.join(path);
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(target, content).unwrap();
    }
    folder
}

/// A default task with the row's number and title.
fn task(number: u32, title: &str) -> LandTask {
    LandTask {
        number,
        title: String::from(title),
        ..LandTask::default()
    }
}

/// The rows for absent folders, proposal Goals and trimmed marker files.
fn rows_none_and_proposal() -> Vec<Row> {
    vec![
        Row {
            name: "none",
            files: Vec::new(),
            expected: LandFacts::default(),
        },
        Row {
            name: "proposal_without_goal",
            files: vec![("proposal.md", "---\ntitle: A\n---\n## Verify\n\nx\n")],
            expected: LandFacts::default(),
        },
        Row {
            name: "proposal_with_goal",
            files: vec![(
                "proposal.md",
                "---\ntitle: A\n---\n## Goal\n\n  Ship it.  \n\n## Verify\n\nx\n",
            )],
            expected: LandFacts {
                goal: String::from("Ship it."),
                ..LandFacts::default()
            },
        },
        Row {
            name: "blank_base_and_approver",
            files: vec![(".run/base", "  \n"), (".run/approver", "\n")],
            expected: LandFacts::default(),
        },
        Row {
            name: "trimmed_approved",
            files: vec![(".run/approved", "  sha256:b  \n")],
            expected: LandFacts {
                approved: Some(String::from("sha256:b")),
                ..LandFacts::default()
            },
        },
    ]
}

/// The rows for task numbers, manual markers and started events.
fn rows_tasks() -> Vec<Row> {
    let one = "tasks.md";
    vec![
        Row {
            name: "unnumbered_tasks",
            files: vec![(one, "- [ ] Unnumbered\n- [x] 7. Seven\n")],
            expected: LandFacts {
                tasks: vec![task(1, "Unnumbered"), task(7, "Seven")],
                ..LandFacts::default()
            },
        },
        Row {
            name: "quoted_manual",
            files: vec![
                (one, "- [ ] 1. One\n"),
                (".run/done/1", "---\nmanual: \"true\"\n---\n"),
            ],
            expected: LandFacts {
                tasks: vec![task(1, "One")],
                ..LandFacts::default()
            },
        },
        Row {
            name: "bare_manual",
            files: vec![(one, "- [ ] 1. One\n"), (".run/done/1", "manual: true\n")],
            expected: LandFacts {
                tasks: vec![task(1, "One")],
                ..LandFacts::default()
            },
        },
        Row {
            name: "started_last_usable",
            files: vec![
                (one, "- [ ] 1. One\n"),
                (
                    ".run/events/1.jsonl",
                    "{\"type\":\"started\",\"data\":{\"harness\":\"pi\",\"model\":\"m\",\"osqVersion\":\"1\"}}\n\
{\"type\":\"started\",\"data\":{\"harness\":\"pi\",\"model\":7,\"osqVersion\":\"2\"}}\nnot json\n",
                ),
            ],
            expected: LandFacts {
                tasks: vec![LandTask {
                    model: Some(String::from("pi m")),
                    version: Some(String::from("1")),
                    ..task(1, "One")
                }],
                ..LandFacts::default()
            },
        },
        Row {
            name: "started_refused",
            files: vec![
                (one, "- [ ] 1. One\n"),
                (
                    ".run/events/1.jsonl",
                    "{\"type\":\"finished\",\"data\":{\"harness\":\"pi\",\"model\":\"m\",\"osqVersion\":\"1\"}}\n\
[\"started\"]\n",
                ),
            ],
            expected: LandFacts {
                tasks: vec![task(1, "One")],
                ..LandFacts::default()
            },
        },
    ]
}

/// The rows for archived events, their acceptance and the last one winning.
fn rows_archived() -> Vec<Row> {
    vec![
        Row {
            name: "archived_first_usable",
            files: vec![(
                ".run/events/change.jsonl",
                "{\"type\":\"archived\",\"timestamp\":\"2026-10-20T13:00:00.000Z\"}\n\
{\"type\":\"archived\",\"timestamp\":\"yesterday\"}\n\
{\"type\":\"archived\",\"timestamp\":7}\nnot json\n",
            )],
            expected: LandFacts {
                archived_at: Some(String::from("2026-10-20T13:00:00.000Z")),
                ..LandFacts::default()
            },
        },
        Row {
            name: "archived_last_usable",
            files: vec![(
                ".run/events/change.jsonl",
                "{\"type\":\"archived\",\"timestamp\":\"2026-10-20T13:00:00.000Z\"}\n\
{\"type\":\"archived\",\"timestamp\":\"2026-10-21T08:00:00.000Z\",\"data\":{}}\n",
            )],
            expected: LandFacts {
                archived_at: Some(String::from("2026-10-21T08:00:00.000Z")),
                ..LandFacts::default()
            },
        },
    ]
}

/// The rows for sorted spec directories and two-word stacked-on lines.
fn rows_folders() -> Vec<Row> {
    vec![
        Row {
            name: "capabilities",
            files: vec![
                ("specs/b/spec.md", ""),
                ("specs/a/spec.md", ""),
                ("specs/notes.md", ""),
            ],
            expected: LandFacts {
                capabilities: vec![String::from("a"), String::from("b")],
                ..LandFacts::default()
            },
        },
        Row {
            name: "stacked_on",
            files: vec![(
                ".run/stacked-on",
                "001-a sha256:x\nlonely\n\n002-b sha256:y overlap orders\n",
            )],
            expected: LandFacts {
                stacked_on: vec![String::from("001-a"), String::from("002-b")],
                ..LandFacts::default()
            },
        },
    ]
}

/// Proves the facts of the archived `001-alpha-orders` fixture change.
///
/// Covers: rust-storage/land-facts-of-an-archived-change
#[test]
fn land_facts_of_an_archived_change() {
    let facts = read_land_facts(&fixture());
    assert_eq!(facts.goal, "Orders gain alpha.", "field goal");
    assert_eq!(
        facts.tasks,
        vec![
            LandTask {
                number: 1,
                title: String::from("When one, two"),
                manual: true,
                model: Some(String::from("pi deepseek/flash")),
                version: Some(String::from("0.3.0")),
            },
            LandTask {
                number: 2,
                title: String::from("When three, four"),
                manual: false,
                model: Some(String::from("pi deepseek/flash")),
                version: Some(String::from("0.3.1")),
            },
        ],
        "field tasks"
    );
    assert_eq!(facts.base.as_deref(), Some("abc123"), "field base");
    assert_eq!(
        facts.approved.as_deref(),
        Some("sha256:aaaa"),
        "field approved"
    );
    assert_eq!(
        facts.approver.as_deref(),
        Some("Mathias <m@example.invalid>"),
        "field approver"
    );
    assert_eq!(
        facts.archived_at.as_deref(),
        Some("2026-10-20T13:00:00.000Z"),
        "field archived_at"
    );
    assert_eq!(
        facts.capabilities,
        vec![String::from("orders")],
        "field capabilities"
    );
    assert_eq!(facts.stacked_on, Vec::<String>::new(), "field stacked_on");
}

/// Proves every row of "Land facts pass over what they cannot use".
///
/// Covers: rust-storage/land-facts-pass-over-what-they-cannot-use
#[test]
fn land_facts_pass_over_what_they_cannot_use() {
    let mut rows = rows_none_and_proposal();
    rows.extend(rows_tasks());
    rows.extend(rows_archived());
    rows.extend(rows_folders());
    for row in rows {
        let folder = write_row(&row);
        assert_eq!(read_land_facts(&folder), row.expected, "row {}", row.name);
    }
}
