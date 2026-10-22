//! Proves the planning sessions and approval digest sections equal TypeScript's.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_show::ShowFeature;

/// The fixture project that every digest test copies.
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

/// A heading line and the indented lines after it.
fn section(text: &str, heading: &str) -> Vec<String> {
    let lines: Vec<&str> = text.split('\n').collect();
    let Some(start) = lines.iter().position(|line| *line == heading) else {
        return Vec::new();
    };
    let mut kept = vec![(*lines[start]).to_owned()];
    for line in &lines[start.saturating_add(1)..] {
        if !line.starts_with(' ') {
            break;
        }
        kept.push((*line).to_owned());
    }
    kept
}

/// The digest from its `Change:` line to the end, without its flag lines.
fn digest(text: &str) -> Vec<String> {
    let lines: Vec<&str> = text.split('\n').collect();
    let Some(start) = lines.iter().position(|line| line.starts_with("Change: ")) else {
        return Vec::new();
    };
    lines[start..]
        .iter()
        .filter(|line| !line.starts_with("Flag: "))
        .map(|line| (*line).to_owned())
        .collect()
}

/// Proves the planning sessions and approval digest of every change.
///
/// Covers: rust-show/show-approval-digest
#[test]
fn show_approval_digest() {
    let root = copy_fixture("show-digest");
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
            section(&output, "Planning Sessions:"),
            section(golden, "Planning Sessions:"),
            "planning sessions differ for {argument}"
        );
        if argument == "1" || argument == "007" {
            assert_eq!(
                digest(&output),
                digest(golden),
                "digest differs for {argument}"
            );
        }
        if argument == "011" {
            assert_eq!(output, golden, "whole text differs for {argument}");
        }
    }
}

/// A capability spec whose delta declares a purpose.
const PURPOSE: &str = "## Purpose\n\nA capability.\n";

/// Creates an empty scratch root.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Writes one delta spec of the edge change.
fn write_capability(root: &Path, name: &str, text: &str) {
    write(
        &root
            .join("openspec/changes/001-edge/specs")
            .join(name)
            .join("spec.md"),
        text,
    );
}

/// Writes one task file of the edge change.
fn write_task(root: &Path, file: &str, title: &str) {
    let text = format!(
        "---\ntitle: {title}\nverify: node --test tests/a.test.ts\nscope: []\n---\n## Acceptance\n\n- [ ] It works.\n"
    );
    write(
        &root.join("openspec/changes/001-edge/tasks").join(file),
        &text,
    );
}

/// Builds the scratch project whose capabilities reach every resemblance rule.
fn edge_project() -> PathBuf {
    let root = scratch("show-digest-edges");
    write(&root.join("openspec/specs/abcde/spec.md"), "# abcde\n");
    write(
        &root.join("openspec/changes/001-edge/proposal.md"),
        "---\ntitle: A works\nverify: node --test tests/a.test.ts\nfeatures:\n  reads: []\n---\n## Goal\n\n  First   sentence.\nSecond! Third? Fourth.\n",
    );
    for name in ["_", "a-b-c-d-e", "abcd", "abcde", "abcde-extra", "abcdx"] {
        write_capability(&root, name, PURPOSE);
    }
    write_capability(&root, "omega", "");
    write_capability(&root, "zzzzz", PURPOSE);
    write_task(&root, "2.md", "Two");
    write_task(&root, "10.md", "Ten");
    write_task(&root, "a.md", "A");
    root
}

/// Four digest lines for a capability row.
fn capability_block(name: &str, creates: bool) -> Vec<String> {
    let heading = if creates {
        format!("  {name} (new capability):")
    } else {
        format!("  {name}:")
    };
    vec![
        heading,
        "    added: (none)".to_owned(),
        "    modified: (none)".to_owned(),
        "    removed: (none)".to_owned(),
    ]
}

/// The digest TypeScript's rules print for the edge project.
fn expected_edge_digest() -> Vec<String> {
    let mut lines = vec![
        "Change: 001-edge".to_owned(),
        "Goal: First sentence. Second!".to_owned(),
        "Tasks:".to_owned(),
        "  2. Two (0 scope files)".to_owned(),
        "  10. Ten (0 scope files)".to_owned(),
        "  a. A (0 scope files)".to_owned(),
        "Capabilities:".to_owned(),
    ];
    for (name, creates) in [
        ("_", true),
        ("a-b-c-d-e", false),
        ("abcd", true),
        ("abcde", false),
        ("abcde-extra", false),
        ("abcdx", false),
        ("omega", false),
        ("zzzzz", true),
    ] {
        lines.extend(capability_block(name, creates));
    }
    lines.push(String::new());
    lines
}

/// Proves capability resemblance, task order and the goal's two sentences.
///
/// Covers: rust-show/show-approval-digest
#[test]
fn digest_edges_cover_typescript_rules() {
    let root = edge_project();
    let output = run(&root, "1");
    assert_eq!(digest(&output), expected_edge_digest());
}

/// A plan log with malformed records, fractional exit codes, and long walls.
const PLAN_LOG: &str = concat!(
    "{\"type\":\"plan_started\",\"sessionId\":\"\",\"timestamp\":\"2026-01-03T00:00:00.000Z\",\"data\":{\"harness\":\"pi\"}}\n",
    "{\"type\":\"plan_started\",\"sessionId\":\"no-time\",\"timestamp\":\"\",\"data\":{\"harness\":\"pi\"}}\n",
    "{\"type\":\"plan_started\",\"sessionId\":\"fast\",\"timestamp\":\"2026-01-01T00:00:00.000Z\",\"data\":{\"harness\":\"pi\",\"model\":\"m\"}}\n",
    "{\"type\":\"plan_exited\",\"sessionId\":\"fast\",\"timestamp\":\"2026-01-01T00:00:42.000Z\",\"data\":{\"exitCode\":2.5,\"wallSeconds\":42,\"usage\":{}}}\n",
    "{\"type\":\"plan_started\",\"sessionId\":\"minute\",\"timestamp\":\"2026-01-02T00:00:00.000Z\",\"data\":{\"harness\":\"claude\",\"model\":null}}\n",
    "{\"type\":\"plan_exited\",\"sessionId\":\"minute\",\"timestamp\":\"2026-01-02T00:01:00.000Z\",\"data\":{\"exitCode\":7,\"wallSeconds\":60,\"usage\":{}}}\n",
);

/// Proves the plan log edges TypeScript skips or formats by its own rules.
///
/// Covers: rust-show/show-approval-digest
#[test]
fn planning_sessions_cover_edges() {
    let root = copy_fixture("show-digest-plan");
    write(
        &root.join("openspec/changes/007-unplanned/.run/plan.jsonl"),
        PLAN_LOG,
    );
    let output = run(&root, "007");
    let expected = vec![
        "Planning Sessions:".to_owned(),
        "  2026-01-01T00:00:00.000Z pi/m exit: 2.5 wall: 42s".to_owned(),
        "  2026-01-02T00:00:00.000Z claude/unavailable exit: 7 wall: 1m".to_owned(),
    ];
    assert_eq!(section(&output, "Planning Sessions:"), expected);
}
