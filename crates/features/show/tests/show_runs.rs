//! Proves that run history and the event timeline equal TypeScript's goldens.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_show::ShowFeature;

/// The fixture project that every run-history test copies.
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

/// One section of a text: its heading and the lines after it starting with a space.
fn section(text: &str, heading: &str) -> Vec<String> {
    let lines: Vec<&str> = text.split('\n').collect();
    let Some(start) = lines.iter().position(|line| *line == heading) else {
        return Vec::new();
    };
    lines[start..]
        .iter()
        .take_while(|line| **line == heading || line.starts_with(' '))
        .map(|line| (*line).to_owned())
        .collect()
}

/// The proposal every scratch run-history change writes.
const PROPOSAL: &str = "---\ntitle: A works\nverify: node --test tests/a.test.ts\nfeatures:\n  reads: []\n---\n## Goal\n\nA works.\n\n## Human steps\n\n### Before approval\n\nNone\n\n### After landing\n\nNone\n";

/// The first task file every scratch run-history change writes.
const TASK: &str = "---\ntitle: When a runs, it works\nverify: node --test tests/a.test.ts\nscope:\n  - src/a.ts\n---\n## Acceptance\n\n- [ ] A works.\n";

/// Creates a scratch change `001-a` with the standard proposal and first task.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    let folder = root.join("openspec/changes/001-a");
    write(&folder.join("proposal.md"), PROPOSAL);
    write(&folder.join("tasks/1.md"), TASK);
    root
}

/// The non-empty run-history lines of a text, in task order.
fn run_lines(text: &str) -> Vec<String> {
    text.lines()
        .filter(|line| {
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
            ]
            .iter()
            .any(|prefix| trimmed.starts_with(prefix))
        })
        .map(|line| line.trim().to_owned())
        .collect()
}

/// Proves JavaScript's `String()` rendering, fallbacks, and file order.
///
/// Covers: rust-show/show-run-history
#[test]
fn event_values_follow_javascript() {
    let root = scratch("show-run-event-values");
    let events = root.join("openspec/changes/001-a/.run/events");
    write(
        &events.join("1.jsonl"),
        concat!(
            "{\"taskNumber\":0,\"type\":\"first\",\"timestamp\":\"2026-10-01T00:00:00.000Z\",",
            "\"data\":{\"empty\":\"\",\"zero\":0,\"false\":false,\"null\":null,",
            "\"array\":[\"a\",null,7,[\"b\",null]],\"object\":{\"x\":1},\"nest\":[]}}\n",
            "{\"taskNumber\":\"\",\"type\":\"\",\"timestamp\":0,\"data\":7}\n",
            "{\"taskNumber\":false,\"type\":\"second\",\"timestamp\":\"2026-10-01T00:00:01.000Z\",",
            "\"data\":[1,null,\"x\",[\"y\",null]]}\n",
            "7\n",
            "not json\n",
        ),
    );
    let output = run(&root, "1");
    assert_eq!(
        section(&output, "Event Timeline:"),
        vec![
            "Event Timeline:".to_owned(),
            "   [Task 1] unknown".to_owned(),
            "   [Task 1] unknown".to_owned(),
            "  2026-10-01T00:00:00.000Z [Task 1] first (empty: , zero: 0, false: false, null: null, array: a,,7,b,, object: [object Object], nest: )".to_owned(),
            "  2026-10-01T00:00:01.000Z [Task 1] second (0: 1, 1: null, 2: x, 3: y,)".to_owned(),
        ]
    );
}

/// Proves event files order by leading number and then by name.
///
/// Covers: rust-show/show-run-history
#[test]
fn event_files_follow_typescript_order() {
    let root = scratch("show-run-file-order");
    let events = root.join("openspec/changes/001-a/.run/events");
    for (name, kind) in [
        ("10.jsonl", "ten"),
        ("2.jsonl", "two"),
        ("change.jsonl", "change"),
    ] {
        write(
            &events.join(name),
            &format!("{{\"type\":\"{kind}\",\"timestamp\":\"same\"}}\n"),
        );
    }
    let output = run(&root, "1");
    assert_eq!(
        section(&output, "Event Timeline:"),
        vec![
            "Event Timeline:".to_owned(),
            "  same [Task 2] two".to_owned(),
            "  same [Task 10] ten".to_owned(),
            "  same [Task change] change".to_owned(),
        ]
    );
}

/// Proves the run-line edges no golden reaches.
///
/// Covers: rust-show/show-run-history
#[test]
fn run_lines_cover_every_recorded_edge() {
    let root = scratch("show-run-edges");
    let folder = root.join("openspec/changes/001-a");
    let events = folder.join(".run/events");
    write(
        &folder.join("tasks/2.md"),
        "---\ntitle: When b runs, it works\nverify: node --test tests/b.test.ts\n---\n## Acceptance\n\n- [ ] B works.\n",
    );
    write(
        &events.join("1.jsonl"),
        concat!(
            "{\"type\":\"verify_ran\",\"timestamp\":\"2026-10-01T00:00:00.000Z\",",
            "\"data\":{\"phase\":\"pre_spawn\",\"exitCode\":1,\"expected\":\"red\",\"missingPaths\":[]}}\n",
            "{\"type\":\"dependencies_added\",\"timestamp\":\"2026-10-01T00:00:01.000Z\",",
            "\"data\":{\"added\":[{\"file\":\"a\",\"name\":\"x\"},{\"file\":\"a\",\"name\":\"y\"},",
            "{\"file\":\"b\",\"name\":\"x\"}]}}\n",
            "{\"type\":\"focused_ran\",\"timestamp\":\"2026-10-01T00:00:02.000Z\",",
            "\"data\":{\"outcome\":\"problem\",\"duration\":1}}\n",
            "{\"type\":\"measures\",\"timestamp\":\"2026-10-01T00:00:03.000Z\",\"data\":{\"phase\":\"start\"}}\n",
            "{\"type\":\"mutation_ran\",\"timestamp\":\"2026-10-01T00:00:04.000Z\",",
            "\"data\":{\"file\":\"f\",\"function\":\"g\",\"outcome\":\"measured\",\"killed\":3,\"survived\":1}}\n",
            "{\"type\":\"noise\",\"timestamp\":\"2026-10-01T00:00:05.000Z\",\"data\":{\"phase\":\"start\"}}\n",
        ),
    );
    write(
        &events.join("2.jsonl"),
        concat!(
            "{\"type\":\"verify_ran\",\"timestamp\":\"2026-10-01T00:00:06.000Z\",",
            "\"data\":{\"phase\":\"pre_spawn\",\"exitCode\":0,\"expected\":\"green\",",
            "\"missingPaths\":[\"x\"]}}\n",
        ),
    );
    let output = run(&root, "1");
    assert_eq!(
        run_lines(&output),
        vec![
            "Pre-spawn verify: started red: verify fails",
            "Dependencies added: x (a), y (a), x (b)",
            "Focused runs: problem 1.00s",
            "Mutation: f#g 3 of 4 killed",
            "Pre-spawn verify: started red: x missing, but it declared green",
        ]
    );
}

/// Proves the Tasks and Event Timeline sections of every change, and the whole
/// text of `approved`, `003` and `004-dead`.
///
/// Covers: rust-show/show-run-history
#[test]
fn show_run_history() {
    let root = copy_fixture("show-run-history");
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
        for heading in ["Tasks:", "Event Timeline:"] {
            assert_eq!(
                section(&output, heading),
                section(golden, heading),
                "{heading} differs for {argument}"
            );
        }
        if matches!(argument, "approved" | "003" | "004-dead") {
            assert_eq!(output, golden, "whole text differs for {argument}");
        }
    }
}
