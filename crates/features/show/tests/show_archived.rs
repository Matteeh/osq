//! Proves that an archived change's whole text equals TypeScript's golden.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_show::ShowFeature;

/// The fixture project that every archived-change test copies.
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
fn section(text: &str, prefix: &str) -> Vec<String> {
    let lines: Vec<&str> = text.split('\n').collect();
    let Some(start) = lines.iter().position(|line| line.starts_with(prefix)) else {
        return Vec::new();
    };
    let mut kept = vec![lines[start].to_owned()];
    for line in &lines[start.saturating_add(1)..] {
        if !line.starts_with(' ') {
            break;
        }
        kept.push((*line).to_owned());
    }
    kept
}

/// A scratch root with no changes.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// A proposal with the given verify and optional check command.
fn proposal(verify: &str, check: Option<&str>) -> String {
    let check = check.map_or_else(String::new, |command| format!("check: {command}\n"));
    format!(
        "---\ntitle: A works\nverify: {verify}\n{check}features:\n  reads: []\n---\n## Goal\n\nA works.\n"
    )
}

/// An archived change folder with one proposal.
fn archived(root: &Path, name: &str, proposal: &str) -> PathBuf {
    let folder = root.join("openspec/changes/archive").join(name);
    write(&folder.join("proposal.md"), proposal);
    folder
}

/// Writes one event stream of a change.
fn events(folder: &Path, name: &str, lines: &str) {
    write(&folder.join(".run/events").join(name), lines);
}

/// Proves the whole archived text for both lookup forms.
///
/// Covers: rust-show/show-archived-change
#[test]
fn show_archived_change() {
    let root = copy_fixture("show-archived");
    let golden = include_str!("fixtures/golden/archived-010.txt");
    for argument in ["10", "openspec/changes/archive/010-archived"] {
        assert_eq!(run(&root, argument), golden, "text differs for {argument}");
    }
}

/// Proves the verification rows' fallbacks and that one row kind alone prints.
///
/// Covers: rust-show/show-archived-change
#[test]
fn verification_edges() {
    let root = scratch("show-archived-verification");
    let outcomes = archived(&root, "001-outcomes", &proposal("node v", None));
    events(
        &outcomes,
        "change.jsonl",
        concat!(
            "{\"type\":\"verification_recorded\",\"timestamp\":\"2026-10-05T09:40:00.000Z\",\"data\":{\"outcome\":\"failed\",\"note\":\"  trimmed  \"}}\n",
            "{\"type\":\"verification_recorded\",\"timestamp\":\"bad time\",\"data\":{\"outcome\":\"weird\",\"note\":\"   \"}}\n",
        ),
    );
    let checks = archived(&root, "002-checks", &proposal("node v", None));
    events(
        &checks,
        "change.jsonl",
        concat!(
            "{\"type\":\"check_ran\",\"timestamp\":\"bad time\",\"data\":{\"command\":\"   \"}}\n",
            "{\"type\":\"check_ran\",\"timestamp\":\"2026-10-05T09:41:00.000Z\",\"data\":{\"command\":\"node c\",\"exitCode\":0}}\n",
            "{\"type\":\"check_ran\",\"timestamp\":\"2026-10-05T09:42:00.000Z\",\"data\":{\"command\":\"node c\",\"exitCode\":2.5}}\n",
        ),
    );
    let none = archived(&root, "003-none", &proposal("node v", None));
    fs::create_dir_all(none.join(".run")).expect("the run folder is created");
    assert_eq!(
        section(&run(&root, "1"), "Verification:"),
        vec![
            "Verification:".to_owned(),
            "  verification_recorded 2026-10-05T09:40:00.000Z: failed (note: trimmed)".to_owned(),
            "  verification_recorded unavailable: unavailable (note: none)".to_owned(),
        ]
    );
    assert_eq!(
        section(&run(&root, "2"), "Verification:"),
        vec![
            "Verification:".to_owned(),
            "  check_ran 2026-10-05T09:41:00.000Z: node c (exit 0)".to_owned(),
            "  check_ran 2026-10-05T09:42:00.000Z: node c (exit 2.5)".to_owned(),
            "  check_ran unavailable: unavailable (exit unavailable)".to_owned(),
        ]
    );
    assert_eq!(
        section(&run(&root, "3"), "Verification:"),
        Vec::<String>::new()
    );
}

/// Proves the validation outcomes, findings, restore text and latest choice.
///
/// Covers: rust-show/show-archived-change
#[test]
fn validation_edges() {
    let root = scratch("show-archived-validation");
    let findings = archived(&root, "001-findings", &proposal("node v", None));
    events(
        &findings,
        "change.jsonl",
        concat!(
            "{\"type\":\"validator_ran\",\"timestamp\":\"2026-10-05T09:00:00.000Z\",\"data\":{\"outcome\":\"failed\",\"harness\":\"old\",\"model\":\"m\",\"duration\":9}}\n",
            "{\"type\":\"validator_ran\",\"timestamp\":\"2026-10-05T09:05:00.000Z\",\"data\":{\"outcome\":\"validated\",\"harness\":\"claude\",\"model\":\"m\",\"duration\":1.5,\"scenarios\":2,\"findings\":[{\"capability\":\"a\",\"requirement\":\"A\",\"scenario\":\"S\",\"problem\":\"no_code\",\"detail\":\"D1\"},{\"capability\":\"b\",\"requirement\":\"B\",\"scenario\":\"T\",\"problem\":\"no_test\",\"detail\":\"D2\"},{\"capability\":\"c\",\"requirement\":\"C\",\"scenario\":\"U\",\"problem\":\"passes_without_change\",\"detail\":\"D3\"}],\"restored\":[\"a\",null,7,[\"x\",null]]}}\n",
        ),
    );
    events(
        &findings,
        "1.jsonl",
        "{\"type\":\"validator_ran\",\"timestamp\":\"2026-10-05T09:06:00.000Z\",\"data\":{\"outcome\":\"not_run\"}}\n",
    );
    let unknown = archived(&root, "002-unknown", &proposal("node v", None));
    events(
        &unknown,
        "change.jsonl",
        "{\"type\":\"validator_ran\",\"timestamp\":\"2026-10-05T09:00:00.000Z\",\"data\":{\"outcome\":\"not_run\"}}\n",
    );
    let reason = archived(&root, "003-reason", &proposal("node v", None));
    events(
        &reason,
        "change.jsonl",
        "{\"type\":\"validator_ran\",\"timestamp\":\"2026-10-05T09:00:00.000Z\",\"data\":{\"outcome\":\"not_run\",\"reason\":\"no_base\"}}\n",
    );
    let failed = archived(&root, "004-failed", &proposal("node v", None));
    events(
        &failed,
        "change.jsonl",
        "{\"type\":\"validator_ran\",\"timestamp\":\"2026-10-05T09:00:00.000Z\",\"data\":{\"outcome\":\"failed\",\"harness\":\"h\",\"model\":\"m\",\"findings\":[{}]}}\n",
    );
    let tie = archived(&root, "005-tie", &proposal("node v", None));
    events(
        &tie,
        "change.jsonl",
        concat!(
            "{\"type\":\"validator_ran\",\"timestamp\":\"2026-10-05T09:00:00.000Z\",\"data\":{\"outcome\":\"not_run\",\"reason\":\"x\"}}\n",
            "{\"type\":\"validator_ran\",\"timestamp\":\"2026-10-05T09:00:00.000Z\",\"data\":{\"outcome\":\"validated\",\"harness\":\"h\",\"model\":\"m\",\"duration\":0,\"scenarios\":0,\"findings\":[]}}\n",
        ),
    );
    assert_eq!(
        section(&run(&root, "1"), "Validation:"),
        vec![
            "Validation: validated by claude/m in 2s, 2 scenarios judged, 3 findings".to_owned(),
            "  - a: A / S: no code meets it. D1".to_owned(),
            "  - b: B / T: no test covers it. D2".to_owned(),
            "  - c: C / U: its test passes without the change. D3".to_owned(),
            "  Restored: a, , 7, x,".to_owned(),
        ]
    );
    assert_eq!(
        section(&run(&root, "2"), "Validation:"),
        vec!["Validation: not run (unknown)".to_owned()]
    );
    assert_eq!(
        section(&run(&root, "3"), "Validation:"),
        vec!["Validation: not run (no_base)".to_owned()]
    );
    assert_eq!(
        section(&run(&root, "4"), "Validation:"),
        vec!["Validation: failed by h/m in 0s".to_owned()]
    );
    assert_eq!(
        section(&run(&root, "5"), "Validation:"),
        vec!["Validation: validated by h/m in 0s, 0 scenarios judged, 0 findings".to_owned()]
    );
}

/// Proves the recertification labels, ordering and attribution rows.
///
/// Covers: rust-show/show-archived-change
#[test]
fn recertification_edges() {
    let root = scratch("show-archived-recertification");
    let folder = archived(&root, "001-a", &proposal("node v", None));
    events(
        &folder,
        "10.jsonl",
        "{\"type\":\"recertification\",\"timestamp\":\"2026-10-05T00:00:10.000Z\",\"data\":{\"task\":\"1\",\"outcome\":\"passed\",\"command\":\"v10\",\"exitCode\":0,\"timedOut\":false}}\n",
    );
    events(
        &folder,
        "2.jsonl",
        "{\"type\":\"recertification\",\"timestamp\":\"2026-10-05T00:00:10.000Z\",\"data\":{\"task\":\"1\",\"outcome\":\"requeued\",\"command\":\"v2\",\"exitCode\":2,\"timedOut\":true}}\n",
    );
    events(
        &folder,
        "3.jsonl",
        concat!(
            "{\"type\":\"recertification\",\"timestamp\":\"2026-10-05T00:00:02.000Z\",\"data\":{\"task\":\"7\",\"outcome\":\"passed\",\"command\":\" node v \",\"exitCode\":0,\"timedOut\":false,\"differingPaths\":[\" b \",\"b\",\"\",5],\"attribution\":[{\"path\":\"b\",\"attribution\":\"  \"},{\"path\":\"a\",\"attribution\":3},{\"path\":\"\",\"attribution\":\"x\"}]}}\n",
            "{\"type\":\"recertification\",\"timestamp\":\"2026-10-05T00:00:01.000Z\",\"data\":{\"task\":\"7\",\"outcome\":\"requeued\"}}\n",
            "{\"type\":\"recertification\",\"timestamp\":\"2026-10-05T00:00:03.000Z\",\"data\":{\"task\":\"9\",\"outcome\":\"passed\"}}\n",
            "{\"type\":\"recertification\",\"timestamp\":\"2026-10-05T00:00:03.000Z\",\"data\":{\"task\":\"5\",\"outcome\":\"passed\"}}\n",
        ),
    );
    assert_eq!(
        section(&run(&root, "1"), "Recertifications:"),
        vec![
            "Recertifications:".to_owned(),
            "  Task 7 2026-10-05T00:00:01.000Z [requeued for agent work]".to_owned(),
            "      Verify: unavailable".to_owned(),
            "      Exit code: unavailable".to_owned(),
            "      Timed out: unavailable".to_owned(),
            "  Task 7 2026-10-05T00:00:02.000Z [recertified]".to_owned(),
            "      Verify: node v".to_owned(),
            "      Exit code: 0".to_owned(),
            "      Timed out: no".to_owned(),
            "      Differing paths:".to_owned(),
            "        - a — attributed to task 3".to_owned(),
            "        - b — unknown".to_owned(),
            "  Task 5 2026-10-05T00:00:03.000Z [recertified]".to_owned(),
            "      Verify: unavailable".to_owned(),
            "      Exit code: unavailable".to_owned(),
            "      Timed out: unavailable".to_owned(),
            "  Task 9 2026-10-05T00:00:03.000Z [recertified]".to_owned(),
            "      Verify: unavailable".to_owned(),
            "      Exit code: unavailable".to_owned(),
            "      Timed out: unavailable".to_owned(),
            "  Task 1 2026-10-05T00:00:10.000Z [requeued for agent work]".to_owned(),
            "      Verify: v2".to_owned(),
            "      Exit code: 2".to_owned(),
            "      Timed out: yes".to_owned(),
            "  Task 1 2026-10-05T00:00:10.000Z [recertified]".to_owned(),
            "      Verify: v10".to_owned(),
            "      Exit code: 0".to_owned(),
            "      Timed out: no".to_owned(),
        ]
    );
}

/// Proves every usable form of a recertification event's task target.
///
/// Covers: rust-show/show-archived-change
#[test]
fn recertification_targets() {
    let root = scratch("show-archived-recertification-targets");
    let folder = archived(&root, "001-a", &proposal("node v", None));
    events(
        &folder,
        "3.jsonl",
        concat!(
            "{\"type\":\"recertification\",\"timestamp\":\"2026-10-05T00:00:01.000Z\",\"data\":{\"task\":7,\"outcome\":\"passed\"}}\n",
            "{\"type\":\"recertification\",\"timestamp\":\"2026-10-05T00:00:02.000Z\",\"data\":{\"task\":-1,\"outcome\":\"passed\"}}\n",
            "{\"type\":\"recertification\",\"timestamp\":\"2026-10-05T00:00:03.000Z\",\"data\":{\"task\":1.5,\"outcome\":\"passed\"}}\n",
            "{\"type\":\"recertification\",\"timestamp\":\"2026-10-05T00:00:04.000Z\",\"data\":{\"task\":0,\"outcome\":\"passed\"}}\n",
            "{\"type\":\"recertification\",\"timestamp\":\"2026-10-05T00:00:05.000Z\",\"data\":{\"task\":\"  \",\"outcome\":\"passed\"}}\n",
            "{\"type\":\"recertification\",\"timestamp\":\"2026-10-05T00:00:06.000Z\",\"data\":{\"task\":\"x\",\"outcome\":\"passed\"}}\n",
        ),
    );
    let task_lines: Vec<String> = section(&run(&root, "1"), "Recertifications:")
        .into_iter()
        .filter(|line| line.starts_with("  Task "))
        .collect();
    assert_eq!(
        task_lines,
        vec![
            "  Task 7 2026-10-05T00:00:01.000Z [recertified]".to_owned(),
            "  Task 3 2026-10-05T00:00:02.000Z [recertified]".to_owned(),
            "  Task 3 2026-10-05T00:00:03.000Z [recertified]".to_owned(),
            "  Task 0 2026-10-05T00:00:04.000Z [recertified]".to_owned(),
            "  Task 3 2026-10-05T00:00:05.000Z [recertified]".to_owned(),
            "  Task 3 2026-10-05T00:00:06.000Z [recertified]".to_owned(),
        ]
    );
}

/// Proves the land gates, disclosures and halt line.
///
/// Covers: rust-show/show-archived-change
#[test]
fn land_edges() {
    let root = scratch("show-archived-land");
    let folder = archived(&root, "001-a", &proposal("node v", Some("node c")));
    events(
        &folder,
        "10.jsonl",
        "{\"type\":\"verify_ran\",\"timestamp\":\"2026-10-05T00:00:02.000Z\",\"data\":{\"command\":\"node t10\",\"exitCode\":1,\"duration\":1.6}}\n",
    );
    events(
        &folder,
        "2.jsonl",
        concat!(
            "{\"type\":\"verify_ran\",\"timestamp\":\"2026-10-05T00:00:03.000Z\",\"data\":{\"command\":\"node t2\",\"exitCode\":1,\"duration\":1.4}}\n",
            "{\"type\":\"verify_ran\",\"timestamp\":\"2026-10-05T00:00:04.000Z\",\"data\":{\"phase\":\"pre_spawn\",\"command\":\"node p\",\"exitCode\":0,\"duration\":9}}\n",
            "{\"type\":\"verify_ran\",\"timestamp\":\"2026-10-05T00:00:20.000Z\",\"data\":{\"command\":\"node late\",\"exitCode\":0}}\n",
        ),
    );
    events(
        &folder,
        "9.jsonl",
        "{\"type\":\"verify_ran\",\"timestamp\":\"2026-10-05T00:00:09.000Z\",\"data\":{\"command\":\"node c\",\"exitCode\":7,\"duration\":0.6}}\n",
    );
    events(
        &folder,
        "change.jsonl",
        concat!(
            "{\"type\":\"check_ran\",\"timestamp\":\"2026-10-05T00:00:05.000Z\",\"data\":{\"command\":\"node c\",\"exitCode\":9}}\n",
            "{\"type\":\"verify_ran\",\"timestamp\":\"2026-10-05T00:00:06.000Z\",\"data\":{\"command\":\"node c\",\"exitCode\":2,\"duration\":0.4}}\n",
            "{\"type\":\"verify_ran\",\"timestamp\":\"2026-10-05T00:00:07.000Z\",\"data\":{\"command\":\"node v\",\"exitCode\":0,\"duration\":2.5}}\n",
            "{\"type\":\"validator_ran\",\"timestamp\":\"2026-10-05T00:00:08.000Z\",\"data\":{\"outcome\":\"validated\",\"harness\":\"claude\",\"model\":\"m\",\"duration\":1.5,\"exitCode\":0,\"findings\":[{},{}]}}\n",
            "{\"type\":\"note\",\"timestamp\":\"2026-10-05T00:00:09.000Z\",\"data\":{\"command\":\"node c\"}}\n",
            "{\"type\":\"archived\",\"timestamp\":\"2026-10-05T00:00:10.000Z\",\"data\":{\"commit\":\"abc\"}}\n",
        ),
    );
    write(
        &folder.join(".run/results/2.md"),
        "## Outside scope\n\n- Elsewhere.\n",
    );
    write(
        &folder.join(".run/results/notes.md"),
        "## Deviated\n\n- Not a task.\n",
    );
    write(
        &folder.join(".run/regressed/change.md"),
        "---\nreason: verify_red\n---\nFirst line\nSecond line\n",
    );
    assert_eq!(
        section(&run(&root, "1"), "Land:"),
        vec![
            "Land: git is off".to_owned(),
            "  Gates at archive:".to_owned(),
            "    task 2: failed exit 1 in 1s (node t2)".to_owned(),
            "    task 9: failed exit 7 in 1s (node c)".to_owned(),
            "    task 10: failed exit 1 in 2s (node t10)".to_owned(),
            "    verify: passed in 3s (node v)".to_owned(),
            "    check: failed exit 2 in 0s (node c)".to_owned(),
            "    validator: validated in 2s (claude/m), 2 findings".to_owned(),
            "  Disclosures: task 2 outside scope".to_owned(),
            "  Halted: verify_red: First line".to_owned(),
        ]
    );
}

/// Proves the last archive event sets the gate cutoff.
///
/// Covers: rust-show/show-archived-change
#[test]
fn land_gates_stop_at_the_last_archive() {
    let root = scratch("show-archived-land-cutoff");
    let folder = archived(&root, "001-a", &proposal("node v", None));
    events(
        &folder,
        "1.jsonl",
        concat!(
            "{\"type\":\"verify_ran\",\"timestamp\":\"2026-10-05T00:00:01.000Z\",\"data\":{\"command\":\"node t\",\"exitCode\":1}}\n",
            "{\"type\":\"verify_ran\",\"timestamp\":\"2026-10-05T00:00:20.000Z\",\"data\":{\"command\":\"node t\",\"exitCode\":0}}\n",
        ),
    );
    events(
        &folder,
        "change.jsonl",
        concat!(
            "{\"type\":\"archived\",\"timestamp\":\"2026-10-05T00:00:10.000Z\"}\n",
            "{\"type\":\"archived\",\"timestamp\":\"2026-10-05T00:00:30.000Z\"}\n",
        ),
    );
    assert_eq!(
        section(&run(&root, "1"), "Land:"),
        vec![
            "Land: git is off".to_owned(),
            "  Gates at archive:".to_owned(),
            "    task 1: passed in 0s (node t)".to_owned(),
        ]
    );
}

/// Proves the land view without a recorded archive or events.
///
/// Covers: rust-show/show-archived-change
#[test]
fn land_without_gates() {
    let root = scratch("show-archived-land-none");
    archived(&root, "001-a", &proposal("node v", None));
    let output = run(&root, "1");
    assert_eq!(
        section(&output, "Land:"),
        vec![
            "Land: git is off".to_owned(),
            "  Gates at archive: none recorded".to_owned(),
        ]
    );
    assert_eq!(section(&output, "Verification:"), Vec::<String>::new());
    assert_eq!(section(&output, "Validation:"), Vec::<String>::new());
    assert_eq!(section(&output, "Recertifications:"), Vec::<String>::new());
}
