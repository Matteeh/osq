//! Validation tests for delta specs: targets, changes, ordering and read errors.

use osq_kernel_specs::{
    FindingCode, SpecFinding, SpecsError, check_delta_targets, validate_change, validate_delta,
};
use std::path::{Path, PathBuf};

/// One expected finding: its code, line and requirement name.
type Expected = (FindingCode, usize, Option<&'static str>);

/// The validation fixtures root.
fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/validate")
}

/// The living specs the target fixtures are checked against.
fn specs_dir() -> PathBuf {
    fixtures().join("targets/specs")
}

/// The change fixtures root.
fn changes_dir() -> PathBuf {
    fixtures().join("targets/changes")
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

/// Checks each finding's code and line, in order.
fn assert_codes_and_lines(findings: &[SpecFinding], expected: &[(FindingCode, usize)]) {
    let actual: Vec<(FindingCode, usize)> = findings
        .iter()
        .map(|finding| (finding.code.clone(), finding.line))
        .collect();
    assert_eq!(expected.to_vec(), actual, "findings: {findings:?}");
}

/// Covers: rust-specs/change-findings
#[test]
fn change_findings() {
    let known = changes_dir().join("known");
    let findings = validate_change(&known, &specs_dir()).expect("the known change");
    assert_findings(&findings, &[]);

    let unknown = changes_dir().join("unknown");
    let alpha = unknown.join("specs/alpha/spec.md").display().to_string();
    let beta = unknown.join("specs/beta/spec.md").display().to_string();
    let findings = validate_change(&unknown, &specs_dir()).expect("the unknown change");
    let expected: &[(&str, FindingCode, usize, &str)] = &[
        (&alpha, FindingCode::UnknownRequirement, 5, "Missing"),
        (&alpha, FindingCode::UnknownRequirement, 14, "Never there"),
        (&alpha, FindingCode::UnknownRequirement, 18, "Ghost"),
        (&beta, FindingCode::UnknownRequirement, 5, "Kept"),
    ];
    assert_eq!(expected.len(), findings.len(), "count: {findings:?}");
    for (finding, (file, code, line, name)) in findings.iter().zip(expected) {
        assert_eq!(*file, finding.file, "file of {finding:?}");
        assert_finding(finding, &(code.clone(), *line, Some(*name)));
    }

    let no_delta = changes_dir().join("no-delta");
    let proposal = no_delta.join("proposal.md").display().to_string();
    let findings = validate_change(&no_delta, &specs_dir()).expect("the change with no delta");
    assert_eq!(1, findings.len(), "count: {findings:?}");
    assert_eq!(proposal, findings[0].file, "file of {:?}", findings[0]);
    assert_finding(&findings[0], &(FindingCode::ChangeWithoutDelta, 1, None));
}

/// Covers: rust-specs/unreadable-delta
#[test]
fn unreadable_delta() {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join("validating-deltas-unreadable");
    let _ = std::fs::remove_dir_all(&root);
    let alpha = root.join("specs/alpha");
    std::fs::create_dir_all(&alpha).expect("a temporary folder");
    let spec = alpha.join("spec.md");
    std::fs::write(&spec, [0xff, 0xfe]).expect("a temporary file");
    match validate_change(&root, &specs_dir()).expect_err("a read error") {
        SpecsError::Read { path, .. } => assert_eq!(spec, path),
        other => panic!("expected a read error, got {other:?}"),
    }
}

/// Covers: rust-specs/delta-spec-findings
#[test]
fn delta_findings_are_ordered_by_line() {
    let text = "# Spec Delta: cap\n## Purpose\nP.\n### Requirement: Stray\n\
                The system SHALL stray.\n## Notes\nx\n";
    let findings = validate_delta("cap.md", text);
    assert_codes_and_lines(
        &findings,
        &[
            (FindingCode::MissingDeltaSections, 1),
            (FindingCode::RequirementOutsideSection, 4),
            (FindingCode::UnknownDeltaSection, 6),
        ],
    );
}

/// Covers: rust-specs/delta-spec-findings
#[test]
fn delta_findings_keep_the_table_order() {
    let text = "### Requirement: Stray\nThe system SHALL stray.\n";
    let findings = validate_delta("cap.md", text);
    assert_codes_and_lines(
        &findings,
        &[
            (FindingCode::RequirementOutsideSection, 1),
            (FindingCode::MissingDeltaSections, 1),
        ],
    );
}

/// Covers: rust-specs/delta-spec-findings
#[test]
fn conflict_points_at_the_later_entry() {
    let text = "# Spec Delta: cap\n\n## REMOVED Requirements\n\n\
                - `### Requirement: Both`\n\n## ADDED Requirements\n\n\
                ### Requirement: Both\nThe system SHALL add.\n\n\
                #### Scenario: Added\n- **WHEN** a\n- **THEN** b\n";
    let findings = validate_delta("cap.md", text);
    assert_findings(
        &findings,
        &[(FindingCode::ConflictingDelta, 9, Some("Both"))],
    );
}

/// Covers: rust-specs/delta-spec-findings
#[test]
fn an_unpaired_from_side_and_an_invalid_entry_count() {
    let unpaired = "# Spec Delta: cap\n\n## RENAMED Requirements\n\n\
                    - FROM: `### Requirement: Old`\n";
    assert_findings(
        &validate_delta("cap.md", unpaired),
        &[(FindingCode::UnpairedRename, 5, Some("Old"))],
    );

    let invalid = "# Spec Delta: cap\n\n## RENAMED Requirements\n\n- FROM: Old bare\n";
    assert_findings(
        &validate_delta("cap.md", invalid),
        &[(FindingCode::InvalidRename, 5, None)],
    );
}

/// Covers: rust-specs/change-findings
#[test]
fn change_findings_are_ordered_by_line() {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join("validating-deltas-order");
    let _ = std::fs::remove_dir_all(&root);
    let alpha = root.join("specs/alpha");
    std::fs::create_dir_all(&alpha).expect("a temporary folder");
    let delta = "# Spec Delta: alpha\n\n## MODIFIED Requirements\n\n\
                 ### Requirement: Missing\nThe system SHALL change.\n\n\
                 #### Scenario: Changed\n- **WHEN** a\n- **THEN** b\n\n\
                 ## REMOVED Requirements\n\nNothing.\n";
    std::fs::write(alpha.join("spec.md"), delta).expect("a temporary file");
    let findings = validate_change(&root, &specs_dir()).expect("a temporary change");
    assert_codes_and_lines(
        &findings,
        &[
            (FindingCode::UnknownRequirement, 5),
            (FindingCode::EmptyDeltaSection, 12),
        ],
    );
}

/// Covers: rust-specs/change-findings
#[test]
fn target_findings_are_ordered_by_line() {
    let text = "# Spec Delta: cap\n\n## REMOVED Requirements\n\n\
                - `### Requirement: Gone`\n\n## MODIFIED Requirements\n\n\
                ### Requirement: Missing\nThe system SHALL change.\n\n\
                #### Scenario: Changed\n- **WHEN** a\n- **THEN** b\n";
    let findings = check_delta_targets("cap.md", text, None);
    assert_codes_and_lines(
        &findings,
        &[
            (FindingCode::UnknownRequirement, 5),
            (FindingCode::UnknownRequirement, 9),
        ],
    );
}

/// Covers: rust-specs/delta-spec-findings
#[test]
fn unknown_and_missing_findings_keep_the_table_order() {
    let text = "## Notes\nx\n";
    let findings = validate_delta("cap.md", text);
    assert_codes_and_lines(
        &findings,
        &[
            (FindingCode::UnknownDeltaSection, 1),
            (FindingCode::MissingDeltaSections, 1),
        ],
    );
}

/// Covers: rust-specs/delta-spec-findings
#[test]
fn duplicate_and_unpaired_findings_keep_the_table_order() {
    let text = "# Spec Delta: cap\n\n## RENAMED Requirements\n\n\
                - FROM: `### Requirement: A`\n- FROM: `### Requirement: A`\n";
    let findings = validate_delta("cap.md", text);
    assert_codes_and_lines(
        &findings,
        &[
            (FindingCode::UnpairedRename, 5),
            (FindingCode::DuplicateRequirement, 6),
            (FindingCode::UnpairedRename, 6),
        ],
    );
}
