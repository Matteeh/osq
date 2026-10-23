//! Lint limit tests: the defaults, every key set and every error the
//! shared integer rule reports.

use osq_kernel_config::{ConfigError, Limits, parse_config};

/// Proves every default limit, including the two the scenario names.
///
/// Covers: rust-config/limit-defaults
#[test]
fn limit_defaults() {
    let expected = Limits {
        max_scope_files: 8,
        max_feature_writes: 2,
        max_contract_tables: 1,
        max_acceptance_lines: 7,
        import_graph_depth: 2,
        max_listed_importers: 8,
        max_rule_length: 160,
        max_project_rules: 10,
        card_output_lines: 20,
        marker_output_lines: 40,
        marker_line_chars: 400,
        max_listed_line_endings: 5,
    };
    let texts = ["", "[limits]", "[limits]\nmaxScopeFiles = 8"];
    for text in texts {
        let config = parse_config(text).expect("the text is valid");
        assert_eq!(config.limits, expected, "for {text:?}");
    }
    assert_eq!(Limits::default(), expected);
    assert_eq!(expected.max_scope_files, 8);
    assert_eq!(expected.max_listed_line_endings, 5);
}

/// Proves every limit key is read, in field order.
///
/// Covers: rust-config/every-limit-set
#[test]
fn every_limit_set() {
    let text = "[limits]\nmaxScopeFiles = 11\nmaxFeatureWrites = 12\n\
        maxContractTables = 13\nmaxAcceptanceLines = 14\nimportGraphDepth = 15\n\
        maxListedImporters = 16\nmaxRuleLength = 17\nmaxProjectRules = 18\n\
        cardOutputLines = 19\nmarkerOutputLines = 20\nmarkerLineChars = 21\n\
        maxListedLineEndings = 22";
    let config = parse_config(text).expect("the text is valid");
    assert_eq!(
        config.limits,
        Limits {
            max_scope_files: 11,
            max_feature_writes: 12,
            max_contract_tables: 13,
            max_acceptance_lines: 14,
            import_graph_depth: 15,
            max_listed_importers: 16,
            max_rule_length: 17,
            max_project_rules: 18,
            card_output_lines: 19,
            marker_output_lines: 20,
            marker_line_chars: 21,
            max_listed_line_endings: 22,
        }
    );
}

/// Proves each limit key sets its own field and leaves the rest default.
///
/// Covers: rust-config/one-limit-set
#[test]
fn one_limit_set() {
    let keys = [
        "maxScopeFiles",
        "maxFeatureWrites",
        "maxContractTables",
        "maxAcceptanceLines",
        "importGraphDepth",
        "maxListedImporters",
        "maxRuleLength",
        "maxProjectRules",
        "cardOutputLines",
        "markerOutputLines",
        "markerLineChars",
        "maxListedLineEndings",
    ];
    for key in keys {
        let mut expected = Limits::default();
        match key {
            "maxScopeFiles" => expected.max_scope_files = 99,
            "maxFeatureWrites" => expected.max_feature_writes = 99,
            "maxContractTables" => expected.max_contract_tables = 99,
            "maxAcceptanceLines" => expected.max_acceptance_lines = 99,
            "importGraphDepth" => expected.import_graph_depth = 99,
            "maxListedImporters" => expected.max_listed_importers = 99,
            "maxRuleLength" => expected.max_rule_length = 99,
            "maxProjectRules" => expected.max_project_rules = 99,
            "cardOutputLines" => expected.card_output_lines = 99,
            "markerOutputLines" => expected.marker_output_lines = 99,
            "markerLineChars" => expected.marker_line_chars = 99,
            "maxListedLineEndings" => expected.max_listed_line_endings = 99,
            _ => unreachable!("the table has no other key"),
        }
        let text = format!("[limits]\n{key} = 99");
        let config = parse_config(&text).expect("the text is valid");
        assert_eq!(config.limits, expected, "for {key}");
    }
}

/// Proves each limit key refuses zero, named by its dotted path.
///
/// Covers: rust-config/each-limit-refuses-zero
#[test]
fn each_limit_refuses_zero() {
    let keys = [
        "maxScopeFiles",
        "maxFeatureWrites",
        "maxContractTables",
        "maxAcceptanceLines",
        "importGraphDepth",
        "maxListedImporters",
        "maxRuleLength",
        "maxProjectRules",
        "cardOutputLines",
        "markerOutputLines",
        "markerLineChars",
        "maxListedLineEndings",
    ];
    for key in keys {
        let text = format!("[limits]\n{key} = 0");
        assert_eq!(
            parse_config(&text).expect_err("zero is refused"),
            ConfigError::InvalidValue {
                key: format!("limits.{key}"),
                reason: "must be a positive integer".to_owned(),
            },
            "for {key}"
        );
    }
}

/// Proves every limit error row.
///
/// Covers: rust-config/limit-errors
#[test]
fn limit_errors() {
    let rows = [
        (
            "limits = 5",
            ConfigError::WrongType {
                key: "limits".to_owned(),
                expected: "a table",
            },
        ),
        (
            "[limits]\nmaxScopeFile = 9",
            ConfigError::UnknownKey {
                key: "limits.maxScopeFile".to_owned(),
            },
        ),
        (
            "[limits]\nzzz = 1\nmaxScopeFiles = 0",
            ConfigError::UnknownKey {
                key: "limits.zzz".to_owned(),
            },
        ),
        (
            "[limits]\nmaxScopeFiles = \"8\"",
            ConfigError::WrongType {
                key: "limits.maxScopeFiles".to_owned(),
                expected: "an integer",
            },
        ),
        (
            "[limits]\nmarkerLineChars = 2.5",
            ConfigError::WrongType {
                key: "limits.markerLineChars".to_owned(),
                expected: "an integer",
            },
        ),
        (
            "[limits]\nmaxRuleLength = -1",
            ConfigError::InvalidValue {
                key: "limits.maxRuleLength".to_owned(),
                reason: "must be a positive integer".to_owned(),
            },
        ),
        (
            "[limits]\nmaxScopeFiles = 0\nmaxListedLineEndings = 0",
            ConfigError::InvalidValue {
                key: "limits.maxScopeFiles".to_owned(),
                reason: "must be a positive integer".to_owned(),
            },
        ),
    ];
    for (text, expected) in rows {
        assert_eq!(
            parse_config(text).expect_err("the text must fail"),
            expected,
            "for {text:?}"
        );
    }
}
