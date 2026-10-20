//! Validation tests for living specs: keyword rules, ordering and the folder reader.

use osq_kernel_specs::{
    FindingCode, SpecFinding, SpecsError, validate_living_spec, validate_living_specs,
};
use std::path::Path;

/// One expected finding: its code, line and requirement name.
type Expected = (FindingCode, usize, Option<&'static str>);

/// Builds a living spec around one requirement body and a passing scenario.
fn living_with_body(body: &str) -> String {
    format!(
        "# words Specification\n\n## Purpose\nWords.\n\n## Requirements\n\n### Requirement: Words\n{body}\n\n#### Scenario: Passing\n- **WHEN** it runs\n- **THEN** it passes\n"
    )
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

/// Covers: rust-specs/whole-word-keywords
#[test]
fn whole_word_keywords() {
    let rows: &[(&str, bool)] = &[
        ("The system SHALL pass.", false),
        ("It MUST pass.", false),
        ("(SHALL)", false),
        ("The system shall pass.", true),
        ("MUSTARD and SHALLOW", true),
        ("A_SHALL and MUST2", true),
        ("~~~\nThe system SHALL pass.\n~~~", true),
    ];
    for (body, expected) in rows {
        let findings = validate_living_spec("words.md", &living_with_body(body));
        let broken = findings
            .iter()
            .any(|finding| finding.code == FindingCode::RequirementWithoutShall);
        assert_eq!(*expected, broken, "keyword finding for {body:?}");
    }
}

/// Covers: rust-specs/living-spec-findings
#[test]
fn findings_are_sorted_and_delta_headings_count() {
    let text = "# cap Specification\n\n## Purpose\nP.\n\n## Requirements\n\n\
                ### Requirement: A\nno keyword here\n\n#### Scenario: Passing\n\
                - **WHEN** it runs\n- **THEN** it passes\n\n### Requirement: A\n\
                no keyword here\n\n#### Scenario: Passing again\n- **WHEN** it runs\n\
                - **THEN** it passes\n\n## ADDED Requirements\n\n## MODIFIED Requirements\n\n\
                ## REMOVED Requirements\n\n## RENAMED Requirements\n";
    let findings = validate_living_spec("cap.md", text);
    assert_findings(
        &findings,
        &[
            (FindingCode::RequirementWithoutShall, 8, Some("A")),
            (FindingCode::DuplicateRequirement, 15, Some("A")),
            (FindingCode::RequirementWithoutShall, 15, Some("A")),
            (FindingCode::DeltaSectionInLivingSpec, 22, None),
            (FindingCode::DeltaSectionInLivingSpec, 24, None),
            (FindingCode::DeltaSectionInLivingSpec, 26, None),
            (FindingCode::DeltaSectionInLivingSpec, 28, None),
        ],
    );
}

/// Covers: rust-specs/living-specs-folder
#[test]
fn living_specs_folder() {
    let specs = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/validate/targets/specs");
    assert_findings(
        &validate_living_specs(&specs).expect("the targets folder"),
        &[],
    );

    let absent = specs.join("no-such-folder");
    assert_findings(
        &validate_living_specs(&absent).expect("a missing folder"),
        &[],
    );

    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join("validating-living");
    let _ = std::fs::remove_dir_all(&root);
    let empty = root.join("beta");
    std::fs::create_dir_all(&empty).expect("a temporary folder");
    std::fs::write(empty.join("osq.yml"), b"group: beta\n").expect("a temporary file");
    assert_findings(
        &validate_living_specs(&root).expect("a folder without a spec"),
        &[],
    );

    let alpha = root.join("alpha");
    std::fs::create_dir_all(&alpha).expect("a temporary folder");
    let spec = alpha.join("spec.md");
    std::fs::write(&spec, [0xff, 0xfe]).expect("a temporary file");
    match validate_living_specs(&root).expect_err("a read error") {
        SpecsError::Read { path, .. } => assert_eq!(spec, path),
        other => panic!("expected a read error, got {other:?}"),
    }
}
