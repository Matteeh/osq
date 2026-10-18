//! Validation tests for delta specs: the defined fixture table.

use osq_kernel_specs::{FindingCode, SpecFinding, validate_delta};
use std::path::{Path, PathBuf};

/// One expected finding: its code, line and requirement name.
type Expected = (FindingCode, usize, Option<&'static str>);

/// The delta validation fixtures folder.
fn delta_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/validate/delta")
}

/// Validates one delta fixture by its file name.
fn validate_fixture(name: &str) -> Vec<SpecFinding> {
    let path = delta_dir().join(name);
    let text = std::fs::read_to_string(&path).expect("a delta fixture");
    validate_delta(&path.display().to_string(), &text)
}

/// Checks one finding's code, line, requirement, fix and message.
fn assert_finding(finding: &SpecFinding, expected: &Expected) {
    assert_eq!(expected.0, finding.code, "code of {finding:?}");
    assert_eq!(expected.1, finding.line, "line of {finding:?}");
    assert_eq!(
        expected.2.map(str::to_string),
        finding.requirement,
        "requirement of {finding:?}"
    );
    assert_eq!(finding.code.fix(), finding.fix, "fix of {finding:?}");
    assert!(!finding.message.is_empty(), "message of {finding:?}");
}

/// Checks a finding list against its expected findings exactly.
fn assert_findings(findings: &[SpecFinding], expected: &[Expected]) {
    assert_eq!(expected.len(), findings.len(), "count: {findings:?}");
    for (finding, want) in findings.iter().zip(expected) {
        assert_finding(finding, want);
    }
}

/// Covers: rust-specs/delta-spec-findings
#[test]
fn delta_spec_findings() {
    let rows: &[(&str, &[Expected])] = &[
        ("valid.md", &[]),
        (
            "unknown-delta-section.md",
            &[(FindingCode::UnknownDeltaSection, 12, None)],
        ),
        (
            "empty-delta-section.md",
            &[(FindingCode::EmptyDeltaSection, 12, None)],
        ),
        (
            "missing-delta-sections.md",
            &[(FindingCode::MissingDeltaSections, 1, None)],
        ),
        (
            "unpaired-rename.md",
            &[(FindingCode::UnpairedRename, 7, Some("Orphan"))],
        ),
        (
            "invalid-rename.md",
            &[(FindingCode::InvalidRename, 7, None)],
        ),
        (
            "conflicting-delta.md",
            &[(FindingCode::ConflictingDelta, 14, Some("Both"))],
        ),
        (
            "duplicate-requirement.md",
            &[(FindingCode::DuplicateRequirement, 14, Some("Twice"))],
        ),
        (
            "requirement-outside-section.md",
            &[(FindingCode::RequirementOutsideSection, 6, Some("Stray"))],
        ),
        (
            "requirement-without-scenario.md",
            &[(FindingCode::RequirementWithoutScenario, 5, Some("Bare"))],
        ),
    ];
    for (name, expected) in rows {
        assert_findings(&validate_fixture(name), expected);
    }
}
