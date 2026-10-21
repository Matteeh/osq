//! Proves the prompt's disclosure and manual edit sections.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_plan::PlanFeature;

/// The one-item queue every row uses.
const QUEUE: &str = "## [a] A\n\nDepends on: nothing\n\nA.\n";

/// The fixed time whose UTC date the brief records.
const TIME: i64 = 1_792_584_000_000;

/// The sentence above the quoted disclosures.
const CLAIM: &str = "Executor claims from result files, not verified facts. Check them against the code before relying on them.";

/// The marker that ends a cut disclosure.
const TRUNCATION: &str = "[truncated]";

/// The line above the open manual edits.
const INTRO: &str = "Edits a human kept with osq manual after the last change that wrote these capabilities. When this change writes one of them, bring its spec in line with the edit.";

/// The label before a long deviation's quoted first line.
const LONG_LABEL: &str = "001-a task 1, deviated:\n> ";

/// Creates a scratch root for one row, removing any left-over folder.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Writes one file under a base folder, creating its parent folders.
fn write(path: &Path, text: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the file's parent is created");
    }
    fs::write(path, text).expect("the file is written");
}

/// Writes one archived change's result file.
fn result(root: &Path, change: &str, task: u64, text: &str) {
    let path = root
        .join("openspec/changes/archive")
        .join(change)
        .join(format!(".run/results/{task}.md"));
    write(&path, text);
}

/// Writes one archived change's archive time.
fn archived_event(root: &Path, change: &str, timestamp: &str) {
    let path = root
        .join("openspec/changes/archive")
        .join(change)
        .join(".run/events/change.jsonl");
    write(
        &path,
        &format!(
            "{{\"type\":\"archived\",\"timestamp\":\"{timestamp}\",\
             \"data\":{{\"archivePath\":\"openspec/changes/archive/{change}\"}}}}\n"
        ),
    );
}

/// Writes one archived change's delta spec for a capability.
fn delta(root: &Path, change: &str, capability: &str) {
    let path = root
        .join("openspec/changes/archive")
        .join(change)
        .join("specs")
        .join(capability)
        .join("spec.md");
    write(
        &path,
        &format!(
            "## ADDED Requirements\n\n### Requirement: {capability} rule\n\
             The system SHALL {capability}.\n\n#### Scenario: {capability} case\n\
             - **WHEN** it runs\n- **THEN** it works\n"
        ),
    );
}

/// Writes one manual edit record.
fn manual(
    root: &Path,
    name: &str,
    kept_at: &str,
    capabilities: &[&str],
    paths: &[&str],
    comment: &str,
) {
    let listed = |values: &[&str]| -> String {
        if values.is_empty() {
            String::from("[]")
        } else {
            let lines: Vec<String> = values
                .iter()
                .map(|value| format!("  - {value}\n"))
                .collect();
            format!("\n{}", lines.concat())
        }
    };
    let text = format!(
        "---\nkept_at: {kept_at}\npaths:{}\ncapabilities:{}\n---\n{comment}\n",
        listed(paths),
        listed(capabilities)
    );
    write(&root.join("openspec/manual").join(name), &text);
}

/// Runs `plan --next` at the fixed time and reads the new prompt.
fn prompt(root: &Path) -> String {
    write(&root.join("openspec/queue.md"), QUEUE);
    PlanFeature::at(TIME)
        .run(&Invocation::new(root, "plan", vec!["--next".to_owned()]))
        .unwrap_or_else(|error| panic!("{}", error));
    let changes = root.join("openspec").join("changes");
    let folder = fs::read_dir(&changes)
        .expect("the changes folder reads")
        .flatten()
        .map(|entry| entry.path())
        .find(|path| {
            path.is_dir()
                && path
                    .file_name()
                    .is_some_and(|name| name != "archive" && name != "rejected")
        })
        .expect("the new change folder exists");
    fs::read_to_string(folder.join("plan-prompt.md")).expect("the prompt reads")
}

/// The body of one optional section, or none when the prompt omits it.
fn section(prompt: &str, heading: &str) -> Option<String> {
    let marker = format!("\n\n## {heading}\n\n");
    let start = prompt.find(&marker)? + marker.len();
    let rest = &prompt[start..];
    Some(match rest.find("\n\n## ") {
        Some(end) => rest[..end].to_owned(),
        None => rest.to_owned(),
    })
}

/// Adds a result file whose only section is `## Changed`.
fn only_changed(root: &Path) {
    result(root, "001-a", 1, "## Changed\n\n- Did it.\n");
}

/// Adds one result file with a deviation and an outside-scope claim.
fn deviated_and_outside(root: &Path) {
    result(
        root,
        "001-a",
        2,
        "## Deviated\n\nUsed a map.\nSecond line.\n\n\
         ## Outside scope\n\nA bug.\n",
    );
}

/// Adds four changes whose one result file holds a missing-context claim.
fn missing_contexts(root: &Path) {
    for change in ["001-a", "002-a", "003-a", "004-a"] {
        result(
            root,
            change,
            1,
            &format!("## Missing context\n\nNo {change}.\n"),
        );
    }
}

/// Adds one deviation longer than the section's whole budget.
fn long_deviation(root: &Path) {
    result(
        root,
        "001-a",
        1,
        &format!("## Deviated\n\n{}\n", "x".repeat(5000)),
    );
}

/// The row's whole section for a deviation longer than the budget.
fn long_body() -> String {
    let text = "x".repeat(3989 - LONG_LABEL.len());
    format!("{CLAIM}\n\n{LONG_LABEL}{text}{TRUNCATION}")
}

/// Proves every row of "Disclosure bodies".
///
/// Covers: rust-plan/disclosure-bodies
#[test]
fn disclosure_bodies() {
    type Setup = fn(&Path);
    let rows: [(&str, Setup, Option<String>); 4] = [
        ("only changed", only_changed, None),
        (
            "deviated and outside",
            deviated_and_outside,
            Some(format!(
                "{CLAIM}\n\n001-a task 2, deviated:\n> Used a map.\n> Second line.\n\n\
                 001-a task 2, outside scope:\n> A bug."
            )),
        ),
        (
            "four missing contexts",
            missing_contexts,
            Some(format!(
                "{CLAIM}\n\n004-a task 1, missing context:\n> No 004-a.\n\n\
                 003-a task 1, missing context:\n> No 003-a.\n\n\
                 002-a task 1, missing context:\n> No 002-a."
            )),
        ),
        ("long deviation", long_deviation, Some(long_body())),
    ];
    for (name, setup, expected) in rows {
        let root = scratch(&format!("prompt_disclosures/{}", name.replace(' ', "_")));
        setup(&root);
        let prompt = prompt(&root);
        assert_eq!(
            section(&prompt, "Recent executor disclosures"),
            expected,
            "row {name}"
        );
    }
}

/// Proves the cut's 11-unit floor and its trailing-newline removal.
///
/// Covers: rust-plan/disclosure-bodies
#[test]
fn disclosure_truncation_edges() {
    let exact = scratch("prompt_disclosures/exact");
    let first = "a".repeat(4000 - LONG_LABEL.len());
    result(&exact, "001-a", 1, &format!("## Deviated\n\n{first}\n"));
    result(
        &exact,
        "001-a",
        2,
        &format!("## Deviated\n\n{}\n", "b".repeat(100)),
    );
    let expected = format!("{CLAIM}\n\n{LONG_LABEL}{first}\n\n{TRUNCATION}");
    assert_eq!(
        section(&prompt(&exact), "Recent executor disclosures"),
        Some(expected),
        "row exact budget"
    );

    let floor = scratch("prompt_disclosures/floor");
    let first = "a".repeat(3995 - LONG_LABEL.len());
    result(&floor, "001-a", 1, &format!("## Deviated\n\n{first}\n"));
    result(
        &floor,
        "001-a",
        2,
        &format!("## Deviated\n\n{}\n", "b".repeat(100)),
    );
    let expected = format!("{CLAIM}\n\n{LONG_LABEL}{first}\n\n{TRUNCATION}");
    assert_eq!(
        section(&prompt(&floor), "Recent executor disclosures"),
        Some(expected),
        "row floor"
    );

    let newline = scratch("prompt_disclosures/newline");
    let line = "a".repeat(3989 - LONG_LABEL.len() - 1);
    result(
        &newline,
        "001-a",
        1,
        &format!("## Deviated\n\n{line}\n{}\n", "b".repeat(100)),
    );
    let expected = format!("{CLAIM}\n\n{LONG_LABEL}{line}{TRUNCATION}");
    assert_eq!(
        section(&prompt(&newline), "Recent executor disclosures"),
        Some(expected),
        "row trailing newline"
    );
}

/// Adds the archived change with an `alpha` delta that every manual row uses.
fn archived_alpha(root: &Path) {
    archived_event(root, "001-a", "2026-10-02T00:00:00.000Z");
    delta(root, "001-a", "alpha");
}

/// Adds no manual edit record.
fn no_records(_root: &Path) {}

/// Adds a record kept before the only alpha change archived.
fn record_before_alpha(root: &Path) {
    manual(
        root,
        "2026-10-01-a.md",
        "2026-10-01T00:00:00.000Z",
        &["alpha"],
        &["src/a.rs"],
        "Kept.",
    );
}

/// Adds a record after the alpha change with an unwritten beta capability.
fn record_after_alpha(root: &Path) {
    manual(
        root,
        "2026-10-03-a.md",
        "2026-10-03T00:00:00.000Z",
        &["alpha", "beta"],
        &["src/a.rs", "src/b.rs"],
        "Fixed it.\n\nMore.",
    );
}

/// Adds a record after the alpha change whose beta capability is still open.
fn record_before_with_beta(root: &Path) {
    manual(
        root,
        "2026-10-01-b.md",
        "2026-10-01T00:00:00.000Z",
        &["alpha", "beta"],
        &["src/a.rs"],
        "Kept.",
    );
}

/// Adds a record after the alpha change without capabilities.
fn record_without_capabilities(root: &Path) {
    manual(
        root,
        "2026-10-03-b.md",
        "2026-10-03T00:00:00.000Z",
        &[],
        &["src/a.rs"],
        "Kept.",
    );
}

/// Proves every row of "Manual edit bodies".
///
/// Covers: rust-plan/manual-edit-bodies
#[test]
fn manual_edit_bodies() {
    type Setup = fn(&Path);
    let rows: [(&str, Setup, Option<String>); 5] = [
        ("no records", no_records, None),
        ("record before alpha", record_before_alpha, None),
        (
            "record after alpha",
            record_after_alpha,
            Some(format!(
                "{INTRO}\n- 2026-10-03T00:00:00.000Z alpha, beta: Fixed it. (src/a.rs, src/b.rs)"
            )),
        ),
        (
            "record before with beta",
            record_before_with_beta,
            Some(format!(
                "{INTRO}\n- 2026-10-01T00:00:00.000Z beta: Kept. (src/a.rs)"
            )),
        ),
        (
            "record without capabilities",
            record_without_capabilities,
            None,
        ),
    ];
    for (name, setup, expected) in rows {
        let root = scratch(&format!("prompt_disclosures/{}", name.replace(' ', "_")));
        archived_alpha(&root);
        setup(&root);
        let prompt = prompt(&root);
        assert_eq!(section(&prompt, "Manual edits"), expected, "row {name}");
    }
}

/// Proves the archive-time comparison's equal, missing and text branches.
///
/// Covers: rust-plan/manual-edit-bodies
#[test]
fn manual_edit_edges() {
    let equal = scratch("prompt_disclosures/manual_equal");
    archived_alpha(&equal);
    manual(
        &equal,
        "2026-10-02-a.md",
        "2026-10-02T00:00:00.000Z",
        &["alpha"],
        &["src/a.rs"],
        "Kept.",
    );
    assert_eq!(
        section(&prompt(&equal), "Manual edits"),
        Some(format!(
            "{INTRO}\n- 2026-10-02T00:00:00.000Z alpha: Kept. (src/a.rs)"
        )),
        "row equal archive time"
    );

    let missing = scratch("prompt_disclosures/manual_missing_time");
    delta(&missing, "001-a", "alpha");
    manual(
        &missing,
        "2026-10-03-a.md",
        "2026-10-03T00:00:00.000Z",
        &["alpha"],
        &["src/a.rs"],
        "Kept.",
    );
    assert_eq!(
        section(&prompt(&missing), "Manual edits"),
        Some(format!(
            "{INTRO}\n- 2026-10-03T00:00:00.000Z alpha: Kept. (src/a.rs)"
        )),
        "row missing archive time"
    );

    let before = scratch("prompt_disclosures/manual_text_before");
    archived_alpha(&before);
    manual(
        &before,
        "1999-a.md",
        "1999/01/01",
        &["alpha"],
        &["src/a.rs"],
        "Kept.",
    );
    assert_eq!(
        section(&prompt(&before), "Manual edits"),
        None,
        "row text time before"
    );

    let after = scratch("prompt_disclosures/manual_text_after");
    archived_alpha(&after);
    manual(
        &after,
        "zzz-a.md",
        "zzz",
        &["alpha"],
        &["src/a.rs"],
        "Kept.",
    );
    assert_eq!(
        section(&prompt(&after), "Manual edits"),
        Some(format!("{INTRO}\n- zzz alpha: Kept. (src/a.rs)")),
        "row text time after"
    );
}

/// The manual section's source compiled here so its time fallback can be probed.
#[allow(dead_code)]
mod source {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/src/next/report/manual.rs"
    ));

    /// Compares an archive time and a keep time as the section does.
    pub(super) fn after(archived_at: Option<&str>, kept_at: &str) -> bool {
        archived_after(archived_at, kept_at)
    }
}

/// Proves the text fallback treats equal times as not later.
///
/// Covers: rust-plan/manual-edit-bodies
#[test]
fn manual_time_fallback() {
    let cases: [(Option<&str>, &str, bool); 3] = [
        (None, "same", false),
        (Some("same"), "same", false),
        (Some("zzz"), "aaa", true),
    ];
    for (archived_at, kept_at, expected) in cases {
        assert_eq!(
            source::after(archived_at, kept_at),
            expected,
            "row {archived_at:?} {kept_at}"
        );
    }
}
