//! Markdown parser tests: text rules, requirement blocks and scenarios.

#[path = "parsing_markdown_docs.rs"]
mod docs;

use osq_kernel_specs::{
    Requirement, js_trim, normalize_requirement_name, parse_requirement, parse_scenario,
};

/// The scenario names of a requirement.
fn scenario_names(requirement: &Requirement) -> Vec<&str> {
    requirement
        .scenarios
        .iter()
        .map(|s| s.name.as_str())
        .collect()
}

/// Covers: rust-specs/javascript-trimming
#[test]
fn javascript_trimming() {
    let rows = [
        ("  a b  ", "a b"),
        ("\u{feff}a\u{a0}", "a"),
        ("\u{85}a", "\u{85}a"),
        ("\t\r\na\n", "a"),
    ];
    for (text, expected) in rows {
        assert_eq!(expected, js_trim(text), "trimming {text:?}");
    }
}

/// Covers: rust-specs/requirement-name-normalization
#[test]
fn requirement_name_normalization() {
    let rows = [
        ("Code ownership", "Code ownership"),
        ("  Spaced name  ", "Spaced name"),
        ("Closed ##", "Closed"),
        ("Closed\t###  ", "Closed"),
        ("Hash#tag", "Hash#tag"),
        ("C# support ##", "C# support"),
        ("Trailing#", "Trailing#"),
    ];
    for (name, expected) in rows {
        assert_eq!(
            expected,
            normalize_requirement_name(name),
            "normalizing {name:?}"
        );
    }
}

/// Covers: rust-specs/requirement-block-parts
#[test]
fn requirement_block_parts() {
    let rows = [
        (
            "### Requirement: Alpha\nThe system SHALL a.\n\n#### Scenario: One\n- **WHEN** x\n- **THEN** y",
            "Alpha",
            "The system SHALL a.",
            vec!["One"],
        ),
        (
            "###Requirement:Beta ##\nThe system SHALL b.",
            "Beta",
            "The system SHALL b.",
            vec![],
        ),
        (
            "### requirement: lower\r\nThe system SHALL c.\r\n#### Scenario: Two\r\n- **WHEN** p\r\n- **THEN** q\r\n",
            "lower",
            "The system SHALL c.",
            vec!["Two"],
        ),
        (
            "### Requirement: Gamma\nThe system SHALL g.\n#### Notes\nfree text\n#### Scenario: Three\n- **WHEN** w\n- **THEN** t",
            "Gamma",
            "The system SHALL g.",
            vec!["Notes", "Three"],
        ),
        ("### Requirement: Empty", "Empty", "", vec![]),
    ];
    for (block, name, body, scenarios) in rows {
        let requirement = parse_requirement(block);
        assert_eq!(name, requirement.name, "name of {block:?}");
        assert_eq!(body, requirement.body, "body of {block:?}");
        assert_eq!(
            scenarios,
            scenario_names(&requirement),
            "scenarios of {block:?}"
        );
    }
}

/// Covers: rust-specs/requirement-raw-text
#[test]
fn requirement_raw_text() {
    let block = "### requirement: lower\r\nThe system SHALL c.\r\n#### Scenario: Two\r\n- **WHEN** p\r\n- **THEN** q\r\n";
    let requirement = parse_requirement(block);
    assert_eq!(
        "### requirement: lower\nThe system SHALL c.\n#### Scenario: Two\n- **WHEN** p\n- **THEN** q",
        requirement.raw
    );
    assert_eq!(
        "#### Scenario: Two\n- **WHEN** p\n- **THEN** q",
        requirement.scenarios[0].raw
    );
}

/// Covers: rust-specs/scenario-bullets
#[test]
fn scenario_bullets() {
    let rows = [
        (
            "#### Scenario: Pass\n- **WHEN** a runs\n- **AND** before then\n- **THEN** b\n- **AND** c\n- **WHEN** d",
            "Pass",
            vec!["a runs", "d"],
            vec!["b"],
        ),
        (
            "####   Scenario:   Spaced  ##\n-  **WHEN**   lots   \n-\t**THEN**\tx",
            "Spaced",
            vec!["lots"],
            vec!["x"],
        ),
        (
            "#### Free label\n* **WHEN** star\n- **THEN** dash",
            "Free label",
            vec![],
            vec!["dash"],
        ),
        (
            "#### scenario: lower\n- **WHEN** a\n- **then** b\n- **THEN** c",
            "lower",
            vec!["a"],
            vec!["c"],
        ),
    ];
    for (block, name, when, then) in rows {
        let scenario = parse_scenario(block);
        assert_eq!(name, scenario.name, "name of {block:?}");
        assert_eq!(when, scenario.when, "when of {block:?}");
        assert_eq!(then, scenario.then, "then of {block:?}");
    }
}

/// Covers: rust-specs/scenario-outcomes
#[test]
fn scenario_outcomes() {
    let block = "#### Scenario: Pass\n- **WHEN** a runs\n- **AND** before then\n- **THEN** b\n- **AND** c\n- **WHEN** d";
    let scenario = parse_scenario(block);
    let texts: Vec<&str> = scenario.outcomes.iter().map(|o| o.text.as_str()).collect();
    assert_eq!(vec!["b", "c"], texts);
    assert!(
        scenario
            .outcomes
            .iter()
            .all(|outcome| outcome.rows.is_none())
    );
}

/// Covers: rust-specs/outcome-tables
#[test]
fn outcome_tables() {
    let block = "#### Scenario: Table\n- **WHEN** a\n- **THEN** rows are:\n\n  | k | v |\n  |---|:-:|\n  | 1 | 2 |\n  | 3 |\n- **AND** none";
    let scenario = parse_scenario(block);
    assert_eq!(2, scenario.outcomes.len());
    let first = &scenario.outcomes[0];
    assert_eq!("rows are:", first.text);
    let rows = first.rows.as_ref().expect("table rows");
    assert_eq!(2, rows.len());
    assert_eq!("1", rows[0]["k"]);
    assert_eq!("2", rows[0]["v"]);
    assert_eq!("3", rows[1]["k"]);
    assert_eq!("", rows[1]["v"]);
    assert_eq!("none", scenario.outcomes[1].text);
    assert!(scenario.outcomes[1].rows.is_none());
}

/// Covers: rust-specs/table-without-an-alignment-row
#[test]
fn table_without_alignment_row() {
    let block = "#### Scenario: No sep\n- **THEN** rows:\n| a | b |\n| 1 | 2 |\ntext";
    let scenario = parse_scenario(block);
    assert_eq!(1, scenario.outcomes.len());
    let outcome = &scenario.outcomes[0];
    assert_eq!("rows:", outcome.text);
    let rows = outcome.rows.as_ref().expect("table rows");
    assert_eq!(1, rows.len());
    assert_eq!("1", rows[0]["a"]);
    assert_eq!("2", rows[0]["b"]);

    let short = parse_scenario("#### Scenario: Short\n- **THEN** rows:\n| a | b |\n| 1 | 2");
    let rows = short.outcomes[0].rows.as_ref().expect("table rows");
    assert_eq!(
        Vec::<std::collections::BTreeMap<String, String>>::new(),
        *rows
    );
}
