//! Proves reading validator runs, task event files and capability sidecars.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{
    CapabilitySidecars, TaskEventFile, ValidationRun, read_capability_sidecars,
    read_latest_validation, read_task_event_files,
};

/// The committed fixture holding a change folder and living specs.
const FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/task-event-files"
);

/// One row of the "Latest validator runs" table.
struct Row {
    /// The scratch folder's name and the assertion's label.
    name: &'static str,
    /// The change stream's lines, in order; empty for no event file.
    lines: Vec<String>,
    /// The run the row expects.
    expected: Option<ValidationRun>,
}

/// A fresh scratch folder under `CARGO_TARGET_TMPDIR`.
fn scratch(test: &str, row: &str) -> PathBuf {
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("reading_validation_coverage")
        .join(test)
        .join(row);
    let _ = fs::remove_dir_all(&folder);
    folder
}

/// Writes the row's lines into a change folder's stream, creating its folders.
fn write_events(folder: &Path, lines: &[String]) {
    if lines.is_empty() {
        return;
    }
    let events = folder.join(".run").join("events");
    fs::create_dir_all(&events).expect("the events folder is created");
    let mut content = lines.join("\n");
    content.push('\n');
    fs::write(events.join("change.jsonl"), content).expect("the change stream is written");
}

/// One `validator_ran` line with the row's outcome and raw findings JSON.
fn ran(outcome: &str, timestamp: &str, findings: &str) -> String {
    format!(
        "{{\"type\":\"validator_ran\",\"timestamp\":\"{timestamp}\",\"data\":{{\"outcome\":\"{outcome}\",\"findings\":{findings}}}}}"
    )
}

/// A `validator_ran` line whose data is the string `validated`.
fn ran_without_data_object(timestamp: &str) -> String {
    format!("{{\"type\":\"validator_ran\",\"timestamp\":\"{timestamp}\",\"data\":\"validated\"}}")
}

/// An `archived` line carrying a validated outcome.
fn archived(timestamp: &str) -> String {
    format!(
        "{{\"type\":\"archived\",\"timestamp\":\"{timestamp}\",\"data\":{{\"outcome\":\"validated\"}}}}"
    )
}

/// The expected run for one row.
fn run(outcome: &str, findings: u64) -> ValidationRun {
    ValidationRun {
        outcome: outcome.to_owned(),
        findings,
    }
}

/// Every "Latest validator runs" row, in the table's order.
fn rows() -> Vec<Row> {
    vec![
        Row {
            name: "greatest-timestamp",
            lines: vec![
                ran("failed", "2026-10-25T11:01:00.000Z", "[]"),
                ran("validated", "2026-10-25T11:05:00.000Z", r#"["a","b"]"#),
            ],
            expected: Some(run("validated", 2)),
        },
        Row {
            name: "earlier-timestamp-loses",
            lines: vec![
                ran("timed_out", "2026-10-25T09:05:00.000Z", "[]"),
                ran("validated", "2026-10-25T09:00:00.000Z", r#"["a"]"#),
            ],
            expected: Some(run("timed_out", 0)),
        },
        Row {
            name: "later-line-wins-a-tie",
            lines: vec![
                ran("validated", "2026-10-25T09:00:00.000Z", r#"["a","b","c"]"#),
                ran(" failed ", "2026-10-25T09:00:00.000Z", r#"["a"]"#),
            ],
            expected: Some(run("failed", 0)),
        },
        Row {
            name: "findings-not-an-array",
            lines: vec![ran("validated", "2026-10-25T09:00:00.000Z", "{}")],
            expected: Some(run("validated", 0)),
        },
        Row {
            name: "unreadable-lines",
            lines: vec![
                ran("  ", "2026-10-25T09:00:00.000Z", "[]"),
                ran("validated", "yesterday", "[]"),
                String::from("not json"),
                String::from("[1]"),
                ran_without_data_object("2026-10-25T09:00:00.000Z"),
            ],
            expected: None,
        },
        Row {
            name: "other-event-type",
            lines: vec![archived("2026-10-25T09:00:00.000Z")],
            expected: None,
        },
        Row {
            name: "no-event-file",
            lines: Vec::new(),
            expected: None,
        },
    ]
}

/// Proves every row of the "Latest validator runs" table.
///
/// Covers: rust-storage/latest-validator-runs
#[test]
fn latest_validator_runs() {
    for row in rows() {
        let folder = scratch("latest_validator_runs", row.name);
        write_events(&folder, &row.lines);
        assert_eq!(
            read_latest_validation(&folder),
            row.expected,
            "row {}",
            row.name
        );
    }
}

/// Proves the committed change folder and the folder with no `tasks/`.
///
/// Covers: rust-storage/task-event-files-of-a-change
#[test]
fn task_event_files_of_a_change() {
    let folder = Path::new(FIXTURE).join("305-active");
    assert_eq!(
        read_task_event_files(&folder),
        vec![
            TaskEventFile {
                id: String::from("1"),
                events: false,
            },
            TaskEventFile {
                id: String::from("10"),
                events: true,
            },
            TaskEventFile {
                id: String::from("2"),
                events: true,
            },
        ]
    );

    let folder = scratch("task_event_files_of_a_change", "no-tasks");
    fs::create_dir_all(&folder).expect("the scratch folder is created");
    assert_eq!(read_task_event_files(&folder), Vec::new());
}

/// Proves a directory named like a task file is not a task file.
///
/// Covers: rust-storage/task-event-files-of-a-change
#[test]
fn task_event_files_skip_directories() {
    let folder = scratch("task_event_files_skip_directories", "directory-named-md");
    fs::create_dir_all(folder.join("tasks").join("9.md")).expect("the decoy is created");
    fs::write(folder.join("tasks").join("1.md"), "# Task 1\n").expect("the task file is written");
    fs::create_dir_all(folder.join(".run").join("events")).expect("the events folder is created");
    fs::write(folder.join(".run").join("events").join("1.jsonl"), "")
        .expect("the event file is written");
    assert_eq!(
        read_task_event_files(&folder),
        vec![TaskEventFile {
            id: String::from("1"),
            events: true,
        }]
    );
}

/// Proves the committed living specs and the root with no living capability.
///
/// Covers: rust-storage/sidecars-of-the-living-specs
#[test]
fn sidecars_of_the_living_specs() {
    assert_eq!(
        read_capability_sidecars(Path::new(FIXTURE)),
        Some(CapabilitySidecars {
            with_sidecar: vec![String::from("alpha")],
            without_sidecar: vec![String::from("beta")],
        })
    );

    let folder = scratch("sidecars_of_the_living_specs", "no-openspec-specs");
    fs::create_dir_all(&folder).expect("the scratch folder is created");
    assert_eq!(read_capability_sidecars(&folder), None);

    let folder = scratch("sidecars_of_the_living_specs", "no-living-spec");
    fs::create_dir_all(folder.join("openspec").join("specs").join("notes"))
        .expect("the sidecar folder is created");
    assert_eq!(read_capability_sidecars(&folder), None);
}

/// Proves each split is in byte order of the capability names.
///
/// Covers: rust-storage/sidecars-of-the-living-specs
#[test]
fn sidecars_are_in_byte_order() {
    let folder = scratch("sidecars_are_in_byte_order", "unsorted");
    for (name, sidecar) in [("zeta", true), ("Alpha", false), ("beta", true)] {
        let dir = folder.join("openspec").join("specs").join(name);
        fs::create_dir_all(&dir).expect("the capability folder is created");
        fs::write(dir.join("spec.md"), "# Spec\n").expect("the spec is written");
        if sidecar {
            fs::write(dir.join("osq.yml"), "owners: []\n").expect("the sidecar is written");
        }
    }
    assert_eq!(
        read_capability_sidecars(&folder),
        Some(CapabilitySidecars {
            with_sidecar: vec![String::from("beta"), String::from("zeta")],
            without_sidecar: vec![String::from("Alpha")],
        })
    );
}
