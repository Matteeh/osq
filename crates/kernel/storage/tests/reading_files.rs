//! Proves reading result disclosures and manual edit records on the fixtures.

use std::path::{Path, PathBuf};

use osq_kernel_storage::{
    ChangeEntry, Location, ManualEdit, ResultSections, TaskDisclosure, parse_result_sections,
    read_change, read_manual_edits,
};

/// The fixture project holding the result files and manual records.
fn files_fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/files")
}

/// The fixture project without a manual folder.
fn quiet_fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/project")
}

/// A change entry of the files fixture.
fn entry(folder: &str, location: Location) -> ChangeEntry {
    let changes = files_fixture().join("openspec").join("changes");
    let path = match location {
        Location::Active => changes.join(folder),
        Location::Archived => changes.join("archive").join(folder),
        Location::Rejected => changes.join("rejected").join(folder),
    };
    ChangeEntry {
        folder: folder.to_owned(),
        location,
        path,
    }
}

/// One named section of a parsed result, as the scenario names it.
fn named<'a>(sections: &'a ResultSections, name: &str) -> Option<&'a str> {
    match name {
        "changed" => sections.changed.as_deref(),
        "deviated" => sections.deviated.as_deref(),
        "missing_context" => sections.missing_context.as_deref(),
        "outside_scope" => sections.outside_scope.as_deref(),
        "blocked" => sections.blocked.as_deref(),
        "next" => sections.next.as_deref(),
        "touched" => sections.touched.as_deref(),
        other => panic!("unknown section {other}"),
    }
}

/// Proves each row of the "Section cases" table.
///
/// Covers: rust-storage/section-cases
#[test]
fn section_cases() {
    let rows: [(&str, &str, Option<&str>); 13] = [
        (
            "## Deviated\n\n- Kept it.\n\n## Next\n",
            "deviated",
            Some("- Kept it."),
        ),
        (
            "#  deviated:\nUsed a map.\n",
            "deviated",
            Some("Used a map."),
        ),
        ("##   Missing   Context\nNone\n", "missing_context", None),
        ("## Missing context\n- None.\n", "missing_context", None),
        ("## Missing context\n*None*\n", "missing_context", None),
        ("## Deviated\nNone; nothing changed.\n", "deviated", None),
        (
            "## Missing context\nNonexistent file.\n",
            "missing_context",
            Some("Nonexistent file."),
        ),
        (
            "## Outside scope\nNone\nA second line.\n",
            "outside_scope",
            Some("None\nA second line."),
        ),
        (
            "## Deviated\nOne.\n### Notes\nTwo.\n",
            "deviated",
            Some("One."),
        ),
        (
            "## Deviated\nOne.\n## deviated\nTwo.\n",
            "deviated",
            Some("One.\nTwo."),
        ),
        ("## Deviated\n\n## Blocked\nWaiting.\n", "deviated", None),
        (
            "## Changed\nDone.\nTouched: src/a.rs, src/b.rs\n",
            "touched",
            Some("src/a.rs, src/b.rs"),
        ),
        (
            "## Deviated\nOne.\ntouched: src/c.rs\nmore\n",
            "deviated",
            Some("One."),
        ),
    ];
    for (text, name, value) in rows {
        let sections = parse_result_sections(text);
        assert_eq!(named(&sections, name), value, "section {name} of {text:?}");
    }
}

/// Proves every named heading reaches its own field.
///
/// Covers: rust-storage/section-cases
#[test]
fn every_section_keeps_its_text() {
    let text = "## Changed\nC\n## Deviated\nD\n## Missing Context\nM\n\
## Outside Scope\nO\n## Blocked\nB\n## Next\nN\n## Touched\nT\n";
    let sections = parse_result_sections(text);
    assert_eq!(sections.changed.as_deref(), Some("C"));
    assert_eq!(sections.deviated.as_deref(), Some("D"));
    assert_eq!(sections.missing_context.as_deref(), Some("M"));
    assert_eq!(sections.outside_scope.as_deref(), Some("O"));
    assert_eq!(sections.blocked.as_deref(), Some("B"));
    assert_eq!(sections.next.as_deref(), Some("N"));
    assert_eq!(sections.touched.as_deref(), Some("T"));
}

/// Proves the disclosures of the archived fixture `001-told`.
///
/// Covers: rust-storage/disclosures-of-the-files-fixture
#[test]
fn disclosures_of_the_files_fixture() {
    let snapshot = read_change(&entry("001-told", Location::Archived)).unwrap();
    let expected = vec![
        TaskDisclosure {
            task: String::from("1"),
            deviated: Some(String::from(
                "- Kept the old name.\n  It reads better.\n\n- Split one file.",
            )),
            missing_context: None,
            outside_scope: Some(String::from("The listing skips hidden folders.")),
        },
        TaskDisclosure {
            task: String::from("2"),
            deviated: Some(String::from("Used a map.\n\nAnd a second deviation.")),
            missing_context: None,
            outside_scope: None,
        },
        TaskDisclosure {
            task: String::from("10"),
            deviated: None,
            missing_context: Some(String::from("Nonexistent file named in the task.")),
            outside_scope: Some(String::from("None\nThe second line keeps this section.")),
        },
    ];
    assert_eq!(snapshot.disclosures, expected);
}

/// Proves a change without a results folder holds no disclosures.
///
/// Covers: rust-storage/no-results-folder
#[test]
fn no_results_folder() {
    let snapshot = read_change(&entry("002-silent", Location::Archived)).unwrap();
    assert_eq!(snapshot.disclosures, Vec::<TaskDisclosure>::new());
}

/// Proves the manual records of the files fixture, in order.
///
/// Covers: rust-storage/records-of-the-files-fixture
#[test]
fn records_of_the_files_fixture() {
    let expected = vec![
        ManualEdit {
            file: String::from("2026-10-01T08-00-00-000Z.md"),
            kept_at: String::from("2026-10-01T08:00:00.000Z"),
            paths: Vec::new(),
            capabilities: Vec::new(),
            comment: String::from("Kept a config edit."),
        },
        ManualEdit {
            file: String::from("mixed.md"),
            kept_at: String::from("2026-10-01T12:00:00.000Z"),
            paths: vec![String::from("src/m.rs")],
            capabilities: Vec::new(),
            comment: String::from("Mixed lists."),
        },
        ManualEdit {
            file: String::from("2026-10-02T09-00-00-000Z.md"),
            kept_at: String::from("2026-10-02T09:00:00.000Z"),
            paths: vec![String::from("src/z.rs"), String::from("src/a.rs")],
            capabilities: vec![String::from("rust-storage"), String::from("rust-core")],
            comment: String::from("Fixed a typo by hand.\n\nSecond paragraph of the comment."),
        },
    ];
    assert_eq!(read_manual_edits(&files_fixture()), expected);
}

/// Proves a project without a manual folder returns no record.
///
/// Covers: rust-storage/no-manual-folder
#[test]
fn no_manual_folder() {
    assert_eq!(
        read_manual_edits(&quiet_fixture()),
        Vec::<ManualEdit>::new()
    );
}
