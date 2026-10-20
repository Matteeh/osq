//! Reading a decisions folder into ADRs, ignored paths and capability groups.

use osq_kernel_specs::{Adr, AppliesTo, DecisionRecords, read_decisions};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

/// One row of the records table: path, number, title, date, status, rule, replacement.
type RecordRow = (
    &'static str,
    &'static str,
    &'static str,
    Option<&'static str>,
    &'static str,
    &'static str,
    Option<&'static str>,
);

/// One row of the list-field table.
type ListRow = (
    &'static str,
    Option<AppliesTo>,
    &'static [&'static str],
    &'static [&'static str],
    &'static [&'static str],
    &'static [&'static str],
);

/// The records table of "Records of the decisions fixture".
const RECORD_ROWS: &[RecordRow] = &[
    (
        "decisions/001-full.md",
        "001",
        "Full record",
        Some("2026-01-02"),
        "accepted",
        "Keep the full record.",
        None,
    ),
    (
        "decisions/002-superseded.md",
        "002",
        "Superseded record",
        None,
        "superseded",
        "Replaced by the full record.",
        Some("1"),
    ),
    (
        "decisions/2-short.md",
        "2",
        "Short",
        None,
        "proposed",
        "",
        None,
    ),
    (
        "decisions/04-malformed.md",
        "04",
        "Malformed lists",
        None,
        "accepted",
        "",
        None,
    ),
    (
        "decisions/005-bad-status.md",
        "005",
        "Bad status",
        None,
        "5",
        "",
        None,
    ),
    (
        "decisions/006-warnings.md",
        "006",
        "Warnings",
        None,
        "proposed",
        "Two\nlines",
        None,
    ),
    (
        "decisions/007-multiline.md",
        "007",
        "Multi-line rule",
        None,
        "accepted",
        "One\ntwo",
        None,
    ),
    (
        "decisions/008-long.md",
        "008",
        "Long rule",
        None,
        "accepted",
        "This rule runs on well past the sixty characters the test allows.",
        None,
    ),
    (
        "decisions/009-superseded-missing.md",
        "009",
        "Missing replacement",
        None,
        "superseded",
        "Superseded without a replacement.",
        None,
    ),
    (
        "decisions/010-superseded-unknown.md",
        "010",
        "Unknown replacement",
        None,
        "superseded",
        "Superseded by an ADR that does not exist.",
        Some("099"),
    ),
];

/// The decisions fixture project root.
fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/decisions")
}

/// Reads the decisions fixture's `decisions` folder with its `openspec` folder.
fn read_fixture() -> DecisionRecords {
    read_decisions(&fixture(), Path::new("decisions"), Path::new("openspec"))
}

/// Finds one ADR of the fixture by path.
fn adr<'a>(records: &'a DecisionRecords, path: &str) -> &'a Adr {
    records
        .adrs
        .iter()
        .find(|adr| adr.path == path)
        .unwrap_or_else(|| panic!("no ADR at {path}"))
}

/// Builds a capability list for an `applies_to` or `governs` expectation.
fn names(values: &[&str]) -> AppliesTo {
    AppliesTo::Capabilities(values.iter().map(|value| (*value).to_string()).collect())
}

/// Builds a string list expectation.
fn strings(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_string()).collect()
}

/// The list-field expectations of "List fields of the decisions fixture".
fn list_rows() -> Vec<ListRow> {
    vec![
        (
            "decisions/001-full.md",
            Some(names(&["alpha", "group:core"])),
            &["tests/a.test.ts", "tests/b.rs"],
            &["left-pad"],
            &["validator"],
            &[],
        ),
        (
            "decisions/002-superseded.md",
            Some(AppliesTo::All),
            &[],
            &[],
            &[],
            &[],
        ),
        (
            "decisions/2-short.md",
            Some(names(&["alpha", "alpha", "group:core"])),
            &[],
            &[],
            &[],
            &[],
        ),
        (
            "decisions/04-malformed.md",
            None,
            &[],
            &[],
            &[],
            &["checks", "denies", "enforced_by"],
        ),
        (
            "decisions/006-warnings.md",
            Some(names(&["ghost", "group:nobody", "beta", "group:core"])),
            &[],
            &[],
            &[],
            &[],
        ),
    ]
}

/// Covers: rust-specs/records-of-the-decisions-fixture
#[test]
fn records_of_the_decisions_fixture() {
    let records = read_fixture();
    let paths: Vec<&str> = records.adrs.iter().map(|adr| adr.path.as_str()).collect();
    let expected_paths: Vec<&str> = RECORD_ROWS.iter().map(|row| row.0).collect();
    assert_eq!(expected_paths, paths);
    for &(path, number, title, date, status, rule, superseded_by) in RECORD_ROWS {
        let found = adr(&records, path);
        assert_eq!(number, found.number, "{path} number");
        assert_eq!(title, found.title, "{path} title");
        assert_eq!(date, found.date.as_deref(), "{path} date");
        assert_eq!(status, found.status, "{path} status");
        assert_eq!(rule, found.rule, "{path} rule");
        assert_eq!(
            superseded_by,
            found.superseded_by.as_deref(),
            "{path} superseded_by"
        );
    }
    assert_eq!(
        strings(&["decisions/003-no-frontmatter.md", "decisions/draft.md"]),
        records.ignored
    );
}

/// Covers: rust-specs/missing-decisions-folder
#[test]
fn missing_decisions_folder() {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("specs-decisions")
        .join("missing");
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("a temporary root");

    let records = read_decisions(&root, Path::new("decisions"), Path::new("openspec"));
    assert_eq!(Vec::<Adr>::new(), records.adrs);
    assert_eq!(Vec::<String>::new(), records.ignored);
    assert_eq!(BTreeMap::new(), records.groups);
}

/// Covers: rust-specs/list-fields-of-the-decisions-fixture
#[test]
fn list_fields_of_the_decisions_fixture() {
    let records = read_fixture();
    let rows = list_rows();
    for (path, applies_to, checks, denies, enforced_by, malformed) in &rows {
        let found = adr(&records, path);
        assert_eq!(*applies_to, found.applies_to, "{path} applies_to");
        assert_eq!(strings(checks), found.checks, "{path} checks");
        assert_eq!(strings(denies), found.denies, "{path} denies");
        assert_eq!(
            strings(enforced_by),
            found.enforced_by,
            "{path} enforced_by"
        );
        assert_eq!(strings(malformed), found.malformed, "{path} malformed");
    }

    let listed: Vec<&str> = rows.iter().map(|row| row.0).collect();
    for found in &records.adrs {
        if listed.contains(&found.path.as_str()) {
            continue;
        }
        assert_eq!(Vec::<String>::new(), found.checks, "{} checks", found.path);
        assert_eq!(Vec::<String>::new(), found.denies, "{} denies", found.path);
        assert_eq!(
            Vec::<String>::new(),
            found.enforced_by,
            "{} enforced_by",
            found.path
        );
        assert_eq!(
            Vec::<String>::new(),
            found.malformed,
            "{} malformed",
            found.path
        );
    }
}

/// Covers: rust-specs/hash-of-an-adr
#[test]
fn hash_of_an_adr() {
    let records = read_fixture();
    assert_eq!(
        "sha256:7661094d657cbcecc6572e2c230a62c213ac34af1536cd58fb18af36c530bff5",
        adr(&records, "decisions/001-full.md").hash
    );
}

/// Covers: rust-specs/groups-of-the-decisions-fixture
#[test]
fn groups_of_the_decisions_fixture() {
    let records = read_fixture();
    let expected: BTreeMap<String, String> =
        [("alpha", "core"), ("beta", "edge"), ("gamma", "core")]
            .into_iter()
            .map(|(capability, group)| (capability.to_string(), group.to_string()))
            .collect();
    assert_eq!(expected, records.groups);
}

/// Covers: rust-specs/governed-capabilities-of-the-decisions-fixture
#[test]
fn governed_capabilities_of_the_decisions_fixture() {
    let records = read_fixture();
    let rows: &[(&str, AppliesTo)] = &[
        ("decisions/001-full.md", names(&["alpha", "gamma"])),
        ("decisions/002-superseded.md", AppliesTo::All),
        ("decisions/2-short.md", names(&["alpha", "gamma"])),
        ("decisions/04-malformed.md", names(&[])),
        ("decisions/005-bad-status.md", names(&["ghost"])),
        (
            "decisions/006-warnings.md",
            names(&["alpha", "beta", "gamma", "ghost"]),
        ),
        ("decisions/008-long.md", names(&["beta"])),
    ];
    for (path, governs) in rows {
        assert_eq!(*governs, adr(&records, path).governs, "{path} governs");
    }
}

/// Covers: rust-specs/frozen-decisions-match-typescript
#[test]
fn frozen_decisions_match_typescript() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/repo_decisions");
    let records = read_decisions(&root, Path::new("decisions"), Path::new("openspec"));
    let actual = serde_json::to_value(records).expect("serialized records");
    let golden = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden/decisions.json");
    let text = fs::read_to_string(golden).expect("the decisions golden");
    let expected: Value = serde_json::from_str(&text).expect("the decisions golden parses");
    assert_matches_golden(&actual, &expected);
}

/// Compares the serialized records with the golden, naming the first difference.
fn assert_matches_golden(actual: &Value, expected: &Value) {
    let actual_adrs = actual["adrs"].as_array().expect("actual adrs");
    let expected_adrs = expected["adrs"].as_array().expect("golden adrs");
    assert_eq!(expected_adrs.len(), actual_adrs.len(), "number of ADRs");
    for (actual_adr, expected_adr) in actual_adrs.iter().zip(expected_adrs) {
        if actual_adr == expected_adr {
            continue;
        }
        let path = actual_adr["path"]
            .as_str()
            .or_else(|| expected_adr["path"].as_str())
            .unwrap_or("unknown");
        let fields: Vec<&String> = actual_adr
            .as_object()
            .into_iter()
            .flatten()
            .map(|(field, _)| field)
            .chain(
                expected_adr
                    .as_object()
                    .into_iter()
                    .flatten()
                    .map(|(field, _)| field),
            )
            .collect();
        for field in fields {
            assert_eq!(
                actual_adr[field.as_str()],
                expected_adr[field.as_str()],
                "first difference in {path} field {field}"
            );
        }
        panic!("first difference in ADR {path}");
    }
    assert_eq!(expected["ignored"], actual["ignored"], "ignored paths");
    assert_eq!(expected["groups"], actual["groups"], "capability groups");
    assert_eq!(expected, actual);
}
