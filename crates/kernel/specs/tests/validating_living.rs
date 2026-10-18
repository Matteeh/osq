//! Validation tests for living specs: finding codes and the defined tables.

use osq_kernel_specs::{FindingCode, SpecFinding, validate_living_spec};
use std::path::{Path, PathBuf};

/// One expected finding: its code, line and requirement name.
type Expected = (FindingCode, usize, Option<&'static str>);

/// Every finding code with its kebab-case string and fix.
const CODES: &[(&FindingCode, &str, &str)] = &[
    (
        &FindingCode::MissingPurpose,
        "missing-purpose",
        "Add a `## Purpose` section that says what the capability is for.",
    ),
    (
        &FindingCode::MissingRequirements,
        "missing-requirements",
        "Add a `## Requirements` section with at least one requirement.",
    ),
    (
        &FindingCode::RequirementOutsideSection,
        "requirement-outside-section",
        "Move the requirement under `## Requirements`, or in a delta spec under an ADDED or MODIFIED section.",
    ),
    (
        &FindingCode::DeltaSectionInLivingSpec,
        "delta-section-in-living-spec",
        "Move the requirements into `## Requirements` and remove the delta heading.",
    ),
    (
        &FindingCode::DuplicateRequirement,
        "duplicate-requirement",
        "Rename or remove one of the requirements, so each name is used once.",
    ),
    (
        &FindingCode::RequirementWithoutShall,
        "requirement-without-shall",
        "State the requirement with SHALL or MUST outside code fences.",
    ),
    (
        &FindingCode::RequirementWithoutScenario,
        "requirement-without-scenario",
        "Add a `#### Scenario:` block with WHEN and THEN bullets.",
    ),
    (
        &FindingCode::ScenarioWithoutWhen,
        "scenario-without-when",
        "Add a `- **WHEN**` bullet to the scenario.",
    ),
    (
        &FindingCode::ScenarioWithoutThen,
        "scenario-without-then",
        "Add a `- **THEN**` bullet to the scenario.",
    ),
    (
        &FindingCode::DuplicateScenario,
        "duplicate-scenario",
        "Rename one of the scenarios, so each name is used once in the requirement.",
    ),
    (
        &FindingCode::UnknownDeltaSection,
        "unknown-delta-section",
        "Use only `## Purpose` and the ADDED, MODIFIED, REMOVED and RENAMED Requirements sections.",
    ),
    (
        &FindingCode::EmptyDeltaSection,
        "empty-delta-section",
        "Add requirements under the heading, or remove it.",
    ),
    (
        &FindingCode::MissingDeltaSections,
        "missing-delta-sections",
        "Add an ADDED, MODIFIED, REMOVED or RENAMED Requirements section.",
    ),
    (
        &FindingCode::UnpairedRename,
        "unpaired-rename",
        "Pair each `FROM:` line with a `TO:` line directly after it.",
    ),
    (
        &FindingCode::InvalidRename,
        "invalid-rename",
        "Write each side as `- FROM:` or `- TO:` and a backticked requirement header.",
    ),
    (
        &FindingCode::ConflictingDelta,
        "conflicting-delta",
        "Name the requirement in one operation only; after a rename, MODIFIED uses the new name.",
    ),
    (
        &FindingCode::UnknownRequirement,
        "unknown-requirement",
        "Name a requirement the living spec has, or add a new one under ADDED.",
    ),
    (
        &FindingCode::ChangeWithoutDelta,
        "change-without-delta",
        "Add a delta spec at `specs/<capability>/spec.md`.",
    ),
];

/// The living validation fixtures folder.
fn living_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/validate/living")
}

/// Validates one living fixture by its file name.
fn validate_fixture(name: &str) -> Vec<SpecFinding> {
    let path = living_dir().join(name);
    let text = std::fs::read_to_string(&path).expect("a living fixture");
    validate_living_spec(&path.display().to_string(), &text)
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

/// Covers: rust-specs/finding-codes
#[test]
fn finding_codes() {
    for (code, name, fix) in CODES {
        assert_eq!(*name, code.as_str(), "code of {code:?}");
        assert_eq!(*fix, code.fix(), "fix of {code:?}");
        assert_eq!(
            serde_json::json!(*name),
            serde_json::to_value(code).expect("a serialized code"),
            "serialization of {code:?}"
        );
    }
}

/// Covers: rust-specs/living-spec-findings
#[test]
fn living_spec_findings() {
    let rows: &[(&str, &[Expected])] = &[
        ("valid.md", &[]),
        (
            "missing-purpose.md",
            &[(FindingCode::MissingPurpose, 1, None)],
        ),
        (
            "missing-requirements.md",
            &[(FindingCode::MissingRequirements, 1, None)],
        ),
        (
            "requirement-outside-section.md",
            &[(FindingCode::RequirementOutsideSection, 17, Some("Stray"))],
        ),
        (
            "delta-section-in-living-spec.md",
            &[(FindingCode::DeltaSectionInLivingSpec, 15, None)],
        ),
        (
            "duplicate-requirement.md",
            &[(FindingCode::DuplicateRequirement, 15, Some("Twice"))],
        ),
    ];
    for (name, expected) in rows {
        assert_findings(&validate_fixture(name), expected);
    }
}

/// Covers: rust-specs/requirement-findings
#[test]
fn requirement_findings() {
    let rows: &[(&str, FindingCode, usize, &str)] = &[
        (
            "requirement-without-shall.md",
            FindingCode::RequirementWithoutShall,
            8,
            "Quiet",
        ),
        (
            "requirement-without-scenario.md",
            FindingCode::RequirementWithoutScenario,
            8,
            "Bare",
        ),
        (
            "scenario-without-when.md",
            FindingCode::ScenarioWithoutWhen,
            15,
            "Partial",
        ),
        (
            "scenario-without-then.md",
            FindingCode::ScenarioWithoutThen,
            11,
            "Partial",
        ),
        (
            "duplicate-scenario.md",
            FindingCode::DuplicateScenario,
            15,
            "Repeats",
        ),
    ];
    for (name, code, line, requirement) in rows {
        assert_findings(
            &validate_fixture(name),
            &[(code.clone(), *line, Some(*requirement))],
        );
    }
}
