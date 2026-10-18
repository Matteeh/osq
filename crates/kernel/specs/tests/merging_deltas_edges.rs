//! Extra merge tests: the edge cases the fixture tables do not cover.

use osq_kernel_specs::{MergeError, merge_delta, merge_living_spec, parse_delta};

/// Covers: rust-specs/merge-cases
#[test]
fn empty_and_whitespace_bases_start_fresh() {
    let delta = parse_delta("## ADDED Requirements\n### Requirement: A\nThe system SHALL a.\n");
    let expected = merge_delta(None, "cap", &delta).expect("a merge");
    for base in [Some(""), Some("   "), Some("\n\t\n")] {
        assert_eq!(expected, merge_delta(base, "cap", &delta).expect("a merge"));
        let living = merge_living_spec(base, "cap", &delta).expect("a merge");
        assert_eq!(Some(expected.as_str()), living.as_deref());
    }
}

/// Covers: rust-specs/merge-cases
#[test]
fn base_without_before_text() {
    let base = "## Requirements\n";
    let delta = parse_delta(
        "## ADDED Requirements\n### Requirement: A\nThe system SHALL a.\n\n\
         #### Scenario: A\n- **WHEN** a\n- **THEN** b\n",
    );
    let merged = merge_delta(Some(base), "cap", &delta).expect("a merge");
    assert_eq!(
        "## Requirements\n\n### Requirement: A\nThe system SHALL a.\n\n\
         #### Scenario: A\n- **WHEN** a\n- **THEN** b\n",
        merged
    );
}

/// Covers: rust-specs/merge-cases
#[test]
fn rename_of_a_bare_header() {
    let base = "## Requirements\n\n### Requirement: A\n";
    let delta = parse_delta(
        "## RENAMED Requirements\n- FROM: `### Requirement: A`\n\
         - TO: `### Requirement: B`\n",
    );
    let merged = merge_delta(Some(base), "cap", &delta).expect("a merge");
    assert_eq!("## Requirements\n\n### Requirement: B\n", merged);
}

/// Covers: rust-specs/merge-cases
#[test]
fn rename_keeps_its_position() {
    let base = "## Requirements\n\n### Requirement: A\nThe system SHALL a.\n\n\
                ### Requirement: B\nThe system SHALL b.\n\n\
                ### Requirement: C\nThe system SHALL c.\n";
    let delta = parse_delta(
        "## RENAMED Requirements\n- FROM: `### Requirement: B`\n\
         - TO: `### Requirement: B2`\n",
    );
    let merged = merge_delta(Some(base), "cap", &delta).expect("a merge");
    assert_eq!(
        "## Requirements\n\n### Requirement: A\nThe system SHALL a.\n\n\
         ### Requirement: B2\nThe system SHALL b.\n\n\
         ### Requirement: C\nThe system SHALL c.\n",
        merged
    );
}

/// Covers: rust-specs/refusal-cases
#[test]
fn fenced_scenario_is_not_a_scenario() {
    let base = "## Requirements\n\n### Requirement: A\nThe system SHALL a.\n\n\
                ```md\n#### Scenario: Hidden\n```\n";
    let delta =
        parse_delta("## MODIFIED Requirements\n### Requirement: A\nThe system SHALL a, revised.\n");
    let merged = merge_delta(Some(base), "cap", &delta).expect("a merge");
    assert!(merged.contains("revised"), "{merged}");
}

/// Covers: rust-specs/refusal-cases
#[test]
fn spaced_and_tight_names_are_not_a_near_miss() {
    let base = "## Requirements\n\n### Requirement: A B\nThe system SHALL a.\n";
    let delta = parse_delta("## ADDED Requirements\n### Requirement: AB\nThe system SHALL b.\n");
    let merged = merge_delta(Some(base), "cap", &delta).expect("a merge");
    assert!(merged.contains("### Requirement: AB"), "{merged}");
}

/// Covers: rust-specs/refusal-cases
#[test]
fn scenario_multiplicity_is_kept() {
    let base = "## Requirements\n\n### Requirement: A\nThe system SHALL a.\n\n\
                #### Scenario: S\n- **WHEN** a\n- **THEN** b\n\n\
                #### Scenario: S\n- **WHEN** c\n- **THEN** d\n";
    let delta = parse_delta(
        "## MODIFIED Requirements\n### Requirement: A\nThe system SHALL a.\n\n\
         #### Scenario: S\n- **WHEN** a\n- **THEN** b\n",
    );
    let error = merge_delta(Some(base), "cap", &delta).expect_err("a refusal");
    assert_eq!(
        MergeError::ScenariosDropped {
            capability: "cap".into(),
            requirement: "A".into(),
            scenarios: vec!["S".into()],
        },
        error
    );
}
