//! Merged validation tests: the "Merged findings" table.

use osq_kernel_specs::{
    FindingCode, MergeChangeError, MergeError, SpecFinding, validate_merged_change,
};
use std::path::{Path, PathBuf};

/// The `validate/` fixtures folder the merged validation reads.
fn validate_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/merge/validate")
}

/// The fixture changes folder.
fn changes_dir() -> PathBuf {
    validate_dir().join("changes")
}

/// The fixture living specs folder.
fn specs_dir() -> PathBuf {
    validate_dir().join("specs")
}

/// One expected finding: its code, line and requirement name.
type Expected = (FindingCode, usize, Option<&'static str>);

/// Checks each finding's file, code, line, requirement, fix and message.
fn assert_findings(case: &str, findings: &[SpecFinding], expected: &[Expected]) {
    let delta = changes_dir().join(case).join("specs/alpha/spec.md");
    assert_eq!(expected.len(), findings.len(), "finding count of {case}");
    for (finding, (code, line, requirement)) in findings.iter().zip(expected) {
        assert_eq!(code, &finding.code, "code of {case}");
        assert_eq!(*line, finding.line, "line of {case}");
        assert_eq!(
            *requirement,
            finding.requirement.as_deref(),
            "requirement of {case}"
        );
        assert_eq!(delta.display().to_string(), finding.file, "file of {case}");
        assert_eq!(finding.code.fix(), finding.fix, "fix of {case}");
        assert!(!finding.message.is_empty(), "message of {case}");
    }
}

/// Covers: rust-specs/merged-findings
#[test]
fn merged_findings() {
    let cases: &[(&str, &[Expected])] = &[
        ("clean", &[]),
        (
            "added-flaw",
            &[(FindingCode::RequirementWithoutScenario, 5, Some("Bare"))],
        ),
        (
            "renamed",
            &[(FindingCode::RequirementWithoutScenario, 1, Some("Renamed"))],
        ),
        ("emptied", &[]),
        ("fresh", &[]),
    ];
    for (case, expected) in cases {
        let findings = validate_merged_change(&changes_dir().join(case), &specs_dir())
            .unwrap_or_else(|error| panic!("validating {case}: {error}"));
        assert_findings(case, &findings, expected);
    }
}

/// Covers: rust-specs/merged-findings
#[test]
fn merged_refusal() {
    let error = validate_merged_change(&changes_dir().join("refused"), &specs_dir())
        .expect_err("refused refuses");
    match error {
        MergeChangeError::Merge { error, .. } => assert_eq!(
            MergeError::ModifiedMissing {
                capability: "alpha".to_string(),
                requirement: "Missing".to_string(),
            },
            error
        ),
        MergeChangeError::Read(other) => panic!("unexpected read error: {other:?}"),
    }
}
