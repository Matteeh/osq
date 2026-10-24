//! Proves `report`'s text and JSON against TypeScript's goldens and rules.

mod summary_support;

use std::fs;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_config::load_config;

use summary_support::{field, golden, project, run, scratch, write};

/// One golden case: its project, lock files and expected files.
struct Case {
    /// The golden's base name.
    name: &'static str,
    /// The fixture project, or none for an empty scratch folder.
    project: Option<&'static str>,
    /// The running lock files to write, as folder, task and contents.
    locks: &'static [(&'static str, &'static str, &'static str)],
}

/// The six cases TypeScript's golden script prints.
const CASES: &[Case] = &[
    Case {
        name: "empty",
        project: None,
        locks: &[],
    },
    Case {
        name: "report-project",
        project: Some("report-project"),
        locks: &[],
    },
    Case {
        name: "report-project-running",
        project: Some("report-project"),
        locks: &[
            ("003-running", "7", "not json\n"),
            ("003-running", "8", "{\"pid\":1,\"startedAt\":1}\n"),
        ],
    },
    Case {
        name: "all-done",
        project: Some("all-done"),
        locks: &[],
    },
    Case {
        name: "thirds",
        project: Some("thirds"),
        locks: &[],
    },
    Case {
        name: "history-project",
        project: Some("history-project"),
        locks: &[],
    },
];

/// Proves each golden text and JSON byte for byte, and repeated `--json`.
///
/// Covers: rust-report/report-summary-equals-typescript-s
#[test]
fn report_summary_equals_typescript() {
    for case in CASES {
        let name = format!("golden-{}", case.name);
        let root = match case.project {
            Some(project_name) => project("goldens", &name, project_name),
            None => scratch("goldens", &name),
        };
        for (folder, task, text) in case.locks {
            let running = root
                .join("openspec/changes")
                .join(folder)
                .join(".run/running");
            write(&running.join(format!("{task}.pid")), text);
        }
        assert_eq!(
            run(&root, &[]).expect("report prints text"),
            golden(case.name, "txt"),
            "{} text",
            case.name
        );
        assert_eq!(
            run(&root, &["--json"]).expect("report prints JSON"),
            golden(case.name, "json"),
            "{} JSON",
            case.name
        );
        if case.name == "report-project" {
            assert_eq!(
                run(&root, &["--json", "--json"]).expect("repeated --json prints JSON"),
                golden(case.name, "json"),
                "{} repeated JSON",
                case.name
            );
        }
    }
}

/// One status-order row: its proposal file and its expected `Now:` fields.
type StatusRow = (Option<&'static str>, [(&'static str, &'static str); 10]);

/// The three status-order rows in table order.
const STATUS_ROWS: [StatusRow; 3] = [
    (
        Some("proposal.md"),
        [
            ("Total tasks", "5"),
            ("Done", "1"),
            ("Verified done", "1"),
            ("Manual done", "0"),
            ("Dead", "1"),
            ("Regressed", "1"),
            ("Running", "1"),
            ("Pending", "1"),
            ("Unmarked", "0"),
            ("Completion rate", "20%"),
        ],
    ),
    (
        Some("spec.md"),
        [
            ("Total tasks", "5"),
            ("Done", "1"),
            ("Verified done", "1"),
            ("Manual done", "0"),
            ("Dead", "1"),
            ("Regressed", "1"),
            ("Running", "1"),
            ("Pending", "1"),
            ("Unmarked", "0"),
            ("Completion rate", "20%"),
        ],
    ),
    (
        None,
        [
            ("Total tasks", "5"),
            ("Done", "0"),
            ("Verified done", "0"),
            ("Manual done", "0"),
            ("Dead", "0"),
            ("Regressed", "0"),
            ("Running", "0"),
            ("Pending", "5"),
            ("Unmarked", "0"),
            ("Completion rate", "0%"),
        ],
    ),
];

/// Proves the first status that holds for each task and the no-proposal rule.
///
/// Covers: rust-report/status-order
#[test]
fn status_order() {
    for (index, (proposal, expected)) in STATUS_ROWS.iter().enumerate() {
        let root = scratch("status", &format!("row-{index}"));
        write_status_change(&root, *proposal);
        let text = run(&root, &[]).expect("report prints text");
        assert_eq!(
            field(&text, "Total specs"),
            "1 (1 active, 0 archived)",
            "row {index}"
        );
        for &(label, value) in expected {
            assert_eq!(field(&text, label), value, "row {index}, {label}");
        }
    }
}

/// Writes the status-order change with every marker the table names.
fn write_status_change(root: &Path, proposal: Option<&str>) {
    let change = root.join("openspec/changes/001-a");
    if let Some(proposal) = proposal {
        write(
            &change.join(proposal),
            "---\ntitle: A\n---\n## Goal\n\nA.\n",
        );
    }
    for task in 1..=5 {
        write(
            &change.join(format!("tasks/{task}.md")),
            "## Task\n\nDo it.\n",
        );
    }
    for folder in [
        "regressed/1.md",
        "done/1",
        "done/2",
        "dead/1.md",
        "dead/2.md",
        "dead/3.md",
        "running/1.pid",
        "running/2.pid",
        "running/3.pid",
        "running/4.pid",
    ] {
        write(&change.join(".run").join(folder), "x\n");
    }
}

/// Proves every report argument error precedes reading the config.
///
/// Covers: rust-report/report-argument-errors
#[test]
fn report_argument_errors() {
    let root = scratch("arguments", "bad-config");
    write(&root.join("osq.toml"), "[vcs]\nenabled = \"yes\"\n");
    let rows: [(&[&str], &str); 3] = [
        (
            &["--since", "2026-10-01"],
            "usage of report: expected [--json], got --since",
        ),
        (
            &["--json", "x", "y"],
            "usage of report: expected [--json], got x",
        ),
        (
            &["--until=2026-10-01"],
            "usage of report: expected [--json], got --until=2026-10-01",
        ),
    ];
    for (args, expected) in rows {
        let error = run(&root, args).expect_err("the argument is refused");
        assert_eq!(error.to_string(), expected, "args {args:?}");
    }
    let mut names: Vec<String> = fs::read_dir(&root)
        .expect("the scratch root reads")
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    assert_eq!(names, vec!["osq.toml"], "an argument error writes no file");
}

/// Proves a refused `osq.toml` fails report with the config error's display.
///
/// Covers: rust-report/report-refuses-a-bad-config
#[test]
fn report_refuses_a_bad_config() {
    let root = project("bad-config", "thirds", "thirds");
    write(&root.join("osq.toml"), "[vcs]\nenabled = \"yes\"\n");
    let expected = load_config(&root)
        .expect_err("the config is refused")
        .to_string();
    match run(&root, &[]).expect_err("report refuses the config") {
        FeatureError::Failed {
            command, message, ..
        } => {
            assert_eq!(command, "report");
            assert_eq!(message, expected);
        }
        other => panic!("expected a failed error, got {other:?}"),
    }
}

/// Proves the shortest decimal a rate with a trailing zero keeps in both forms.
///
/// Covers: rust-report/report-summary-equals-typescript-s
#[test]
fn report_rate_keeps_the_shortest_decimal() {
    let root = scratch("rate", "half");
    let change = root.join("openspec/changes/001-a");
    write(
        &change.join("proposal.md"),
        "---\ntitle: A\n---\n## Goal\n\nA.\n",
    );
    for task in 1..=8 {
        write(
            &change.join(format!("tasks/{task}.md")),
            "## Task\n\nDo it.\n",
        );
    }
    write(&change.join(".run/done/1"), "done\n");
    let text = run(&root, &[]).expect("report prints text");
    assert_eq!(field(&text, "Completion rate"), "12.5%");
    let json = run(&root, &["--json"]).expect("report prints JSON");
    assert!(
        json.contains("\"completionRate\": 12.5,"),
        "the JSON rate is 12.5: {json}"
    );
}
