//! Merge tests: the merge-case and refusal-case tables of the delta merge.

use osq_kernel_specs::{
    Delta, MergeError, RenameSide, merge_delta, merge_living_spec, parse_delta,
};
use std::path::{Path, PathBuf};

/// The merge case fixtures folder.
fn cases_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/merge/cases")
}

/// Reads a fixture file as bytes.
fn read_bytes(path: &Path) -> Vec<u8> {
    std::fs::read(path).unwrap_or_else(|error| panic!("reading {}: {error}", path.display()))
}

/// Reads a fixture file as UTF-8 text, with no newline conversion.
fn read_text(path: &Path) -> String {
    String::from_utf8(read_bytes(path))
        .unwrap_or_else(|error| panic!("utf-8 of {}: {error}", path.display()))
}

/// Loads a case's base text, or none when the case has no `base.md`, and its delta.
fn load(case: &str) -> (Option<String>, Delta) {
    let dir = cases_dir().join(case);
    let base_path = dir.join("base.md");
    let base = base_path.exists().then(|| read_text(&base_path));
    let delta = parse_delta(&read_text(&dir.join("delta.md")));
    (base, delta)
}

/// Checks one refusal case: its error, accessors and display.
fn assert_refusal(case: &str, expected: &MergeError, requirement: Option<&str>) {
    let (base, delta) = load(case);
    let error = merge_delta(base.as_deref(), "cap", &delta).expect_err("a refusal");
    assert_eq!(expected, &error, "error of {case}");
    assert_eq!("cap", error.capability(), "capability of {case}");
    assert_eq!(requirement, error.requirement(), "requirement of {case}");
    let text = read_text(&cases_dir().join(case).join("error.txt"));
    assert_eq!(text, error.to_string(), "display of {case}");
    let living = merge_living_spec(base.as_deref(), "cap", &delta);
    assert_eq!(Err(expected.clone()), living, "living error of {case}");
}

/// Covers: rust-specs/merge-cases
#[test]
fn merge_cases() {
    let rows: &[(&str, bool)] = &[
        ("ops", true),
        ("new-purpose", true),
        ("new-no-purpose", true),
        ("new-removed-ignored", true),
        ("same-added", true),
        ("no-requirements-header", true),
        ("fence", true),
        ("emptied", false),
    ];
    for (case, keeps) in rows {
        let (base, delta) = load(case);
        let merged = merge_delta(base.as_deref(), "cap", &delta)
            .unwrap_or_else(|error| panic!("{case}: {error}"));
        let expected = read_bytes(&cases_dir().join(case).join("merged.md"));
        assert_eq!(
            expected.as_slice(),
            merged.as_bytes(),
            "merged.md of {case}"
        );
        let living = merge_living_spec(base.as_deref(), "cap", &delta)
            .unwrap_or_else(|error| panic!("{case}: {error}"));
        if *keeps {
            assert_eq!(Some(merged.as_str()), living.as_deref(), "living of {case}");
        } else {
            assert_eq!(None, living.as_deref(), "living of {case}");
        }
    }
}

/// Covers: rust-specs/refusal-cases
#[test]
fn refusal_cases_renames() {
    let rows: &[(&str, MergeError, Option<&str>)] = &[
        (
            "invalid-rename",
            MergeError::InvalidRename {
                capability: "cap".into(),
                line: "- FROM: A".into(),
            },
            None,
        ),
        (
            "unpaired-from",
            MergeError::UnpairedRename {
                capability: "cap".into(),
                side: RenameSide::From,
                requirement: "A".into(),
            },
            Some("A"),
        ),
        (
            "unpaired-to",
            MergeError::UnpairedRename {
                capability: "cap".into(),
                side: RenameSide::To,
                requirement: "A2".into(),
            },
            Some("A2"),
        ),
        (
            "rename-without-base",
            MergeError::RenameWithoutBase {
                capability: "cap".into(),
                requirement: "A".into(),
            },
            Some("A"),
        ),
        (
            "rename-source-missing",
            MergeError::RenameSourceMissing {
                capability: "cap".into(),
                requirement: "Z".into(),
            },
            Some("Z"),
        ),
        (
            "rename-target-exists",
            MergeError::RenameTargetExists {
                capability: "cap".into(),
                requirement: "Two words".into(),
            },
            Some("Two words"),
        ),
    ];
    for (case, expected, requirement) in rows {
        assert_refusal(case, expected, *requirement);
    }
}

/// Covers: rust-specs/refusal-cases
#[test]
fn refusal_cases_added() {
    let rows: &[(&str, MergeError, Option<&str>)] = &[
        (
            "duplicate-added",
            MergeError::DuplicateAdded {
                capability: "cap".into(),
                requirement: "N".into(),
            },
            Some("N"),
        ),
        (
            "added-exists",
            MergeError::AddedExists {
                capability: "cap".into(),
                requirement: "A".into(),
            },
            Some("A"),
        ),
        (
            "added-near-miss",
            MergeError::AddedNearMiss {
                capability: "cap".into(),
                requirement: "two  Words".into(),
            },
            Some("two  Words"),
        ),
    ];
    for (case, expected, requirement) in rows {
        assert_refusal(case, expected, *requirement);
    }
}

/// Covers: rust-specs/refusal-cases
#[test]
fn refusal_cases_missing() {
    let rows: &[(&str, MergeError, Option<&str>)] = &[
        (
            "modified-without-base",
            MergeError::ModifiedMissing {
                capability: "cap".into(),
                requirement: "A".into(),
            },
            Some("A"),
        ),
        (
            "removed-missing",
            MergeError::RemovedMissing {
                capability: "cap".into(),
                requirement: "Z".into(),
            },
            Some("Z"),
        ),
        (
            "modified-missing",
            MergeError::ModifiedMissing {
                capability: "cap".into(),
                requirement: "Z".into(),
            },
            Some("Z"),
        ),
        (
            "scenarios-dropped",
            MergeError::ScenariosDropped {
                capability: "cap".into(),
                requirement: "Two words".into(),
                scenarios: vec!["S1".into(), "S2".into()],
            },
            Some("Two words"),
        ),
    ];
    for (case, expected, requirement) in rows {
        assert_refusal(case, expected, *requirement);
    }
}
