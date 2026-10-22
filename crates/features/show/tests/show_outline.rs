//! Proves that each change's outline equals TypeScript's golden outline.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_show::ShowFeature;

/// The fixture project that every outline test copies.
fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/show-project")
}

/// Creates a scratch copy of the fixture with the running marker git ignores.
fn copy_fixture(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    copy_dir(&fixture(), &root);
    write(
        &root.join("openspec/changes/003-running/.run/running/1.pid"),
        "{\"pid\":4242,\"startedAt\":1759395600000}\n",
    );
    root
}

/// Copies a directory tree recursively.
fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("the destination folder is created");
    for entry in fs::read_dir(from)
        .expect("the source folder reads")
        .flatten()
    {
        let target = to.join(entry.file_name());
        if entry.file_type().expect("the entry type reads").is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).expect("the file is copied");
        }
    }
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().expect("the file has a parent"))
        .expect("the parent folders are created");
    fs::write(path, text).expect("the file is written");
}

/// Runs show with one literal argument on a root.
fn run(root: &Path, argument: &str) -> String {
    ShowFeature
        .run(&Invocation::new(root, "show", vec![argument.to_owned()]))
        .expect("the change is shown")
        .text
}

/// The outline of a text: its lines before Planning Sessions, without the
/// verification, validation and run-history blocks.
fn outline(text: &str) -> Vec<String> {
    let lines: Vec<&str> = text.split('\n').collect();
    let end = lines
        .iter()
        .position(|line| *line == "Planning Sessions:")
        .unwrap_or(lines.len());
    let mut kept = Vec::new();
    let mut skipping = false;
    for line in &lines[..end] {
        if line.starts_with("Verification:") || line.starts_with("Validation:") {
            if kept.last().is_some_and(|line: &String| line.is_empty()) {
                kept.pop();
            }
            skipping = true;
            continue;
        }
        if skipping && line.starts_with(' ') {
            continue;
        }
        skipping = false;
        if run_line(line) {
            continue;
        }
        kept.push((*line).to_owned());
    }
    kept
}

/// Whether a line is one of the run-history lines the outline leaves out.
fn run_line(line: &str) -> bool {
    let trimmed = line.trim_start();
    [
        "Pre-spawn verify:",
        "Retries:",
        "Stuck:",
        "Focused runs:",
        "Mutation:",
        "Survived:",
        "Dependencies added:",
        "Instructions changed after approval:",
        "Disclosures:",
    ]
    .iter()
    .any(|prefix| trimmed.starts_with(prefix))
}

/// Proves the outline of every change and the whole text of `5` and `006`.
///
/// Covers: rust-show/show-outline
#[test]
fn show_outline() {
    let root = copy_fixture("show-outline");
    let cases = [
        ("1", include_str!("fixtures/golden/active-001.txt")),
        ("approved", include_str!("fixtures/golden/approved-002.txt")),
        ("003", include_str!("fixtures/golden/running-003.txt")),
        ("004-dead", include_str!("fixtures/golden/dead-004.txt")),
        ("5", include_str!("fixtures/golden/steering-005.txt")),
        ("006", include_str!("fixtures/golden/blocked-006.txt")),
        ("007", include_str!("fixtures/golden/unplanned-007.txt")),
        ("10", include_str!("fixtures/golden/archived-010.txt")),
        (
            "openspec/changes/archive/010-archived",
            include_str!("fixtures/golden/archived-010.txt"),
        ),
        ("011", include_str!("fixtures/golden/rejected-011.txt")),
    ];
    for (argument, golden) in cases {
        let output = run(&root, argument);
        assert_eq!(
            outline(&output),
            outline(golden),
            "outline differs for {argument}"
        );
        if argument == "5" || argument == "006" {
            assert_eq!(output, golden, "whole text differs for {argument}");
        }
        if argument == "004-dead" {
            assert!(
                output
                    .lines()
                    .any(|line| line == "      Disclosures: deviated, outside scope"),
                "the task disclosures print"
            );
        }
    }
}
